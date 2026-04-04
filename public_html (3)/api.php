<?php
// 1. Configure session cookie BEFORE session_start
ini_set('session.cookie_httponly', 1);
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_samesite', 'Lax');

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 2. Set Headers
header('Content-Type: application/json');

// CORS: allow credentials from the same origin
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 3. Database Connection
require_once 'config.php';

$action = $_GET['action'] ?? '';

// 4. Router
switch($action) {
    case 'login':         handleLogin();      break;
    case 'checkSession':  checkSession();     break;  // <-- dedicated session check (fixes admin logout bug)
    case 'getLogs':       getLogs();          break;
    case 'saveLog':       saveLog();          break;
    case 'markReturned':  markReturned();     break;
    case 'logout':        logout();           break;
    case 'saveExpense':   saveExpense();      break;
    case 'getExpenses':   getExpenses();      break;
    case 'deleteLog':            deleteLog();             break;
    case 'updateLog':            updateLog();             break;
    case 'getNotifications':     getNotifications();      break;
    case 'markNotificationsRead': markNotificationsRead(); break;
    case 'saveDeposit':          saveDeposit();           break;
    case 'getDeposits':          getDeposits();           break;
    case 'editDeposit':          editDeposit();           break;
    case 'deleteDeposit':        deleteDeposit();         break;
    case 'editExpense':          editExpense();           break;
    case 'deleteExpense':        deleteExpense();         break;
    case 'saveIdPhoto':          saveIdPhoto();           break;
    default:              echo json_encode(['error' => 'Invalid action']); break;
}

// ── SESSION CHECK (separate from login — avoids GET/POST confusion) ──
function checkSession() {
    if (isset($_SESSION['user'])) {
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['success' => false, 'message' => 'No active session']);
    }
}

// ── AUTHENTICATION ──
function handleLogin() {
    global $pdo;

    // Only accept POST for login
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
        return;
    }

    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    if ($username === '' || $password === '') {
        echo json_encode(['success' => false, 'message' => 'Username and password are required']);
        return;
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        // Only use password_verify — all passwords in DB must be hashed with password_hash()
        if ($user && password_verify($password, $user['password'])) {
            // Regenerate session ID on login to prevent session fixation
            session_regenerate_id(true);
            $_SESSION['user'] = [
                'username'    => $user['username'],
                'role'        => $user['role'],
                'displayName' => $user['display_name']
            ];
            echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        }
    } catch(PDOException $e) {
        error_log($e->getMessage()); // log to server, never expose to client
        echo json_encode(['success' => false, 'message' => 'A server error occurred']);
    }
}

// ── RETRIEVE DATA ──
function getLogs() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    try {
        $stmt = $pdo->query("
            SELECT *, 
            CASE 
                WHEN amount_cash > 0 THEN 'Cash'
                WHEN amount_gcash > 0 THEN 'GCash'
                ELSE 'Other'
            END as payment_method 
            FROM rental_logs 
            ORDER BY created_at DESC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode([]);
    }
}

// ── CREATE DATA ──
function saveLog() {
    global $pdo;
    if (!isset($_SESSION['user'])) { 
        echo json_encode(['success' => false, 'message' => 'Not logged in']); 
        return; 
    }
    
    $data = json_decode(file_get_contents('php://input'), true);

    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'Invalid or empty request body']);
        return;
    }

    $amount_cash = -1; $amount_gcash = -1;
    $additional_cash = 0; $additional_gcash = 0;

    if (($data['payment_method'] ?? '') === 'Cash') {
        $amount_cash  = $data['amount'] ?? 0;
        $additional_cash = $data['additional_charge'] ?? 0;
    } elseif (($data['payment_method'] ?? '') === 'GCash') {
        $amount_gcash  = $data['amount'] ?? 0;
        $additional_gcash = $data['additional_charge'] ?? 0;
    }

    // Use Philippine time (UTC+8) for created_at, but allow a client-supplied record_date (for backdating)
    $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
    $recordDate = !empty($data['record_date']) ? $data['record_date'] : $now->format('Y-m-d');
    $createdAt  = $recordDate . ' ' . $now->format('H:i:s');

    // Auto-add id_photo column if missing
    try { $pdo->exec("ALTER TABLE rental_logs ADD COLUMN id_photo MEDIUMTEXT NULL"); } catch(PDOException $ignored) {}

    // Admin can submit a log on behalf of a target branch (validated server-side)
    $sessionUser = $_SESSION['user'];
    $allowedBranches = ['baliwag', 'pampanga', 'trinoma', 'smartwheels', 'bataan', 'admin'];
    if ($sessionUser['role'] === 'admin' && !empty($data['target_branch']) && in_array($data['target_branch'], $allowedBranches)) {
        $effectiveUsername = $data['target_branch'];
    } else {
        $effectiveUsername = $sessionUser['username'];
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO rental_logs (
                employee_username, name, address, waiver, or_number, cart_number,
                valid_id, time_in, time_out, return_status,
                amount_cash, amount_gcash, additional_cash, additional_gcash, 
                total, return_time, created_at, id_photo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $effectiveUsername,
            $data['name'] ?? '',
            $data['address'] ?? '',
            $data['waiver'] ?? '',
            $data['or_number'] ?? '',
            $data['cart_number'] ?? '',
            $data['valid_id'] ?? '',
            $data['time_in'] ?? '',
            $data['time_out'] ?? '',
            $data['return_status'] ?? 'Pending',
            $amount_cash,
            $amount_gcash,
            $additional_cash,
            $additional_gcash,
            $data['total'] ?? 0,
            $data['return_time'] ?? '',
            $createdAt,
            $data['id_photo'] ?? null
        ]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// ── UPDATE DATA ──
function markReturned() {
    global $pdo;
    if (!isset($_SESSION['user'])) { 
        echo json_encode(['success' => false, 'message' => 'Not logged in']); 
        return; 
    }
    
    $data = json_decode(file_get_contents('php://input'), true);
    try {
        $stmt = $pdo->prepare("
            UPDATE rental_logs
            SET return_time = ?, return_status = 'Returned'
            WHERE id = ?
        ");
        $stmt->execute([$data['return_time'], $data['id']]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update record']);
    }
}

// ── LOGOUT ──
function logout() {
    session_destroy();
    echo json_encode(['success' => true]);
}

// ── SAVE EXPENSE ──
function saveExpense() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }
    
    $data = json_decode(file_get_contents('php://input'), true);

    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'Invalid or empty request body']);
        return;
    }

    // Default expense_date to record_date (header date) or today in PH time if not provided
    if (empty($data['expense_date'])) {
        if (!empty($data['record_date'])) {
            $data['expense_date'] = $data['record_date'];
        } else {
            $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
            $data['expense_date'] = $now->format('Y-m-d');
        }
    }
    
    // Admin can record an expense on behalf of a target branch
    $sessionUserExp = $_SESSION['user'];
    $allowedBranchesExp = ['baliwag', 'pampanga', 'trinoma', 'smartwheels', 'bataan', 'admin'];
    if ($sessionUserExp['role'] === 'admin' && !empty($data['target_branch']) && in_array($data['target_branch'], $allowedBranchesExp)) {
        $expEffectiveUsername = $data['target_branch'];
    } else {
        $expEffectiveUsername = $sessionUserExp['username'];
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO expenses (employee_username, expense_date, particulars, amount)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([
            $expEffectiveUsername,
            $data['expense_date'],
            $data['particulars'] ?? '',
            $data['amount'] ?? 0
        ]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// ── GET EXPENSES ──
function getExpenses() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    
    try {
        $stmt = $pdo->query("
            SELECT * FROM expenses 
            ORDER BY expense_date DESC, created_at DESC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode([]);
    }
}
// ── DELETE LOG ──
function deleteLog() {
    global $pdo;

    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID']);
        return;
    }

    try {
        // Fetch record details before deleting (for audit log)
        $fetch = $pdo->prepare("SELECT name, or_number, cart_number, employee_username FROM rental_logs WHERE id = ?");
        $fetch->execute([$id]);
        $rec = $fetch->fetch(PDO::FETCH_ASSOC);

        if (!$rec) {
            echo json_encode(['success' => false, 'message' => 'Record not found']);
            return;
        }

        $detail = "Customer: {$rec['name']}, OR: {$rec['or_number']}, Cart: {$rec['cart_number']}";
        $recordOwner = $rec['employee_username'];

        // Branch accounts can only delete their own records; admin can delete any
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("DELETE FROM rental_logs WHERE id = ?");
            $stmt->execute([$id]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM rental_logs WHERE id = ? AND employee_username = ?");
            $stmt->execute([$id, $_SESSION['user']['username']]);
            if ($stmt->rowCount() === 0) {
                echo json_encode(['success' => false, 'message' => 'Record not found or access denied']);
                return;
            }
        }

        // Always write audit log — admin actions use the record owner as context
        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $actorUsername = $_SESSION['user']['username'];
        $actorRole     = $_SESSION['user']['role'];
        $auditDetail   = $actorRole === 'admin'
            ? "[Admin deleted] {$detail} (originally by: {$recordOwner})"
            : "[Branch deleted] {$detail}";

        try {
            $logStmt = $pdo->prepare("
                INSERT INTO audit_log (employee_username, action_type, record_id, detail, created_at, is_read)
                VALUES (?, 'DELETE', ?, ?, ?, 0)
            ");
            $logStmt->execute([$actorUsername, $id, $auditDetail, $now->format('Y-m-d H:i:s')]);
        } catch(PDOException $le) {
            error_log('Audit log error (delete): ' . $le->getMessage());
        }

        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete record']);
    }
}
// ── UPDATE LOG ──
function updateLog() {
    global $pdo;

    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID: ' . ($data['id'] ?? 'missing')]);
        return;
    }

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("
                UPDATE rental_logs SET
                    name = ?, address = ?, waiver = ?, or_number = ?, cart_number = ?,
                    valid_id = ?, time_in = ?, time_out = ?, return_time = ?,
                    amount_cash = ?, amount_gcash = ?,
                    additional_cash = ?, additional_gcash = ?,
                    total = ?, return_status = ?, id_photo = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['address'] ?? '',
                $data['waiver'] ?? '',
                $data['or_number'] ?? '',
                $data['cart_number'] ?? '',
                $data['valid_id'] ?? '',
                $data['time_in'] ?? '',
                $data['time_out'] ?? '',
                $data['return_time'] ?? '',
                $data['amount_cash'] ?? -1,
                $data['amount_gcash'] ?? -1,
                $data['additional_cash'] ?? 0,
                $data['additional_gcash'] ?? 0,
                $data['total'] ?? 0,
                $data['return_status'] ?? 'Pending',
                $data['id_photo'] ?? null,
                $id
            ]);
            if ($stmt->rowCount() === 0) {
                echo json_encode(['success' => false, 'message' => 'Record not found']);
                return;
            }
        } else {
            // Branch can only edit their own records
            $stmt = $pdo->prepare("
                UPDATE rental_logs SET
                    name = ?, address = ?, waiver = ?, or_number = ?, cart_number = ?,
                    valid_id = ?, time_in = ?, time_out = ?, return_time = ?,
                    amount_cash = ?, amount_gcash = ?,
                    additional_cash = ?, additional_gcash = ?,
                    total = ?, return_status = ?, id_photo = ?
                WHERE id = ? AND employee_username = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['address'] ?? '',
                $data['waiver'] ?? '',
                $data['or_number'] ?? '',
                $data['cart_number'] ?? '',
                $data['valid_id'] ?? '',
                $data['time_in'] ?? '',
                $data['time_out'] ?? '',
                $data['return_time'] ?? '',
                $data['amount_cash'] ?? -1,
                $data['amount_gcash'] ?? -1,
                $data['additional_cash'] ?? 0,
                $data['additional_gcash'] ?? 0,
                $data['total'] ?? 0,
                $data['return_status'] ?? 'Pending',
                $data['id_photo'] ?? null,
                $id,
                $_SESSION['user']['username']
            ]);
            if ($stmt->rowCount() === 0) {
                echo json_encode(['success' => false, 'message' => 'Record not found or you do not have permission to edit it']);
                return;
            }
        }
        // Always write audit log for edits — admin and branch alike
        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $actorUsername = $_SESSION['user']['username'];
        $actorRole     = $_SESSION['user']['role'];
        $detail = "Customer: " . ($data['name'] ?? '?') . ", OR: " . ($data['or_number'] ?? '?') . ", Cart: " . ($data['cart_number'] ?? '?');
        $auditDetail = $actorRole === 'admin'
            ? "[Admin edited] {$detail}"
            : "[Branch edited] {$detail}";

        try {
            $logStmt = $pdo->prepare("
                INSERT INTO audit_log (employee_username, action_type, record_id, detail, created_at, is_read)
                VALUES (?, 'EDIT', ?, ?, ?, 0)
            ");
            $logStmt->execute([$actorUsername, $id, $auditDetail, $now->format('Y-m-d H:i:s')]);
        } catch(PDOException $le) {
            error_log('Audit log error (edit): ' . $le->getMessage());
        }

        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'DB error: ' . $e->getMessage()]);
    }
}

// ── GET NOTIFICATIONS (admin only) ──
function getNotifications() {
    global $pdo;
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
        echo json_encode([]);
        return;
    }
    try {
        $stmt = $pdo->query("
            SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode([]);
    }
}

// ── MARK NOTIFICATIONS READ ──
function markNotificationsRead() {
    global $pdo;
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
        echo json_encode(['success' => false]);
        return;
    }
    try {
        $pdo->exec("UPDATE audit_log SET is_read = 1 WHERE is_read = 0");
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false]);
    }
}

// ── SAVE DEPOSIT ──
function saveDeposit() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    if (!$data) {
        echo json_encode(['success' => false, 'message' => 'Invalid or empty request body']);
        return;
    }

    $amount = floatval($data['amount'] ?? 0);
    if ($amount <= 0) {
        echo json_encode(['success' => false, 'message' => 'Amount must be greater than zero']);
        return;
    }

    $now = new DateTime('now', new DateTimeZone('Asia/Manila'));

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS deposits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_username VARCHAR(100) NOT NULL,
                deposit_date DATE NOT NULL,
                deposit_time TIME NOT NULL,
                description VARCHAR(255) DEFAULT '',
                amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                receipt_photo MEDIUMTEXT NULL,
                created_at DATETIME NOT NULL
            )
        ");

        // Auto-add receipt_photo column to existing tables
        try { $pdo->exec("ALTER TABLE deposits ADD COLUMN receipt_photo MEDIUMTEXT NULL"); } catch(PDOException $col) {}

        $receiptPhoto = $data['receipt_photo'] ?? null;

        $stmt = $pdo->prepare("
            INSERT INTO deposits (employee_username, deposit_date, deposit_time, description, amount, receipt_photo, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        // Admin can record a deposit on behalf of a target branch
        $sessionUserDep = $_SESSION['user'];
        $allowedBranchesDep = ['baliwag', 'pampanga', 'trinoma', 'smartwheels', 'bataan', 'admin'];
        if ($sessionUserDep['role'] === 'admin' && !empty($data['target_branch']) && in_array($data['target_branch'], $allowedBranchesDep)) {
            $depEffectiveUsername = $data['target_branch'];
        } else {
            $depEffectiveUsername = $sessionUserDep['username'];
        }
        $stmt->execute([
            $depEffectiveUsername,
            !empty($data['record_date']) ? $data['record_date'] : $now->format('Y-m-d'),
            $now->format('H:i:s'),
            $data['description'] ?? '',
            $amount,
            $receiptPhoto,
            $now->format('Y-m-d H:i:s')
        ]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

// ── GET DEPOSITS ──
function getDeposits() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS deposits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                employee_username VARCHAR(100) NOT NULL,
                deposit_date DATE NOT NULL,
                deposit_time TIME NOT NULL,
                description VARCHAR(255) DEFAULT '',
                amount DECIMAL(10,2) NOT NULL DEFAULT 0,
                receipt_photo MEDIUMTEXT NULL,
                created_at DATETIME NOT NULL
            )
        ");

        // Auto-add receipt_photo column to existing tables
        try { $pdo->exec("ALTER TABLE deposits ADD COLUMN receipt_photo MEDIUMTEXT NULL"); } catch(PDOException $col) {}

        $stmt = $pdo->query("
            SELECT id, employee_username, deposit_date, deposit_time,
                   description, amount, receipt_photo, created_at
            FROM deposits
            ORDER BY deposit_date DESC, deposit_time DESC
        ");
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode([]);
    }
}

// ── EDIT EXPENSE ──
function editExpense() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID']);
        return;
    }

    $particulars = trim($data['particulars'] ?? '');
    $amount      = floatval($data['amount'] ?? 0);

    if ($particulars === '') {
        echo json_encode(['success' => false, 'message' => 'Particulars cannot be empty']);
        return;
    }
    if ($amount <= 0) {
        echo json_encode(['success' => false, 'message' => 'Amount must be greater than zero']);
        return;
    }

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("UPDATE expenses SET particulars = ?, amount = ? WHERE id = ?");
            $stmt->execute([$particulars, $amount, $id]);
        } else {
            $stmt = $pdo->prepare("UPDATE expenses SET particulars = ?, amount = ? WHERE id = ? AND employee_username = ?");
            $stmt->execute([$particulars, $amount, $id, $_SESSION['user']['username']]);
        }
        if ($stmt->rowCount() === 0) {
            echo json_encode(['success' => false, 'message' => 'Record not found or access denied']);
            return;
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update expense']);
    }
}

// ── DELETE EXPENSE ──
function deleteExpense() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID']);
        return;
    }

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ?");
            $stmt->execute([$id]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM expenses WHERE id = ? AND employee_username = ?");
            $stmt->execute([$id, $_SESSION['user']['username']]);
        }
        if ($stmt->rowCount() === 0) {
            echo json_encode(['success' => false, 'message' => 'Record not found or access denied']);
            return;
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete expense']);
    }
}

// ── EDIT DEPOSIT ──
function editDeposit() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID']);
        return;
    }

    $description = trim($data['description'] ?? '');
    $amount      = floatval($data['amount'] ?? 0);

    if ($description === '') {
        echo json_encode(['success' => false, 'message' => 'Description cannot be empty']);
        return;
    }
    if ($amount <= 0) {
        echo json_encode(['success' => false, 'message' => 'Amount must be greater than zero']);
        return;
    }

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("UPDATE deposits SET description = ?, amount = ? WHERE id = ?");
            $stmt->execute([$description, $amount, $id]);
        } else {
            $stmt = $pdo->prepare("UPDATE deposits SET description = ?, amount = ? WHERE id = ? AND employee_username = ?");
            $stmt->execute([$description, $amount, $id, $_SESSION['user']['username']]);
        }
        if ($stmt->rowCount() === 0) {
            echo json_encode(['success' => false, 'message' => 'Record not found or access denied']);
            return;
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to update deposit']);
    }
}

// ── DELETE DEPOSIT ──
function deleteDeposit() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = isset($data['id']) ? (int)$data['id'] : 0;

    if ($id <= 0) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID']);
        return;
    }

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("DELETE FROM deposits WHERE id = ?");
            $stmt->execute([$id]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM deposits WHERE id = ? AND employee_username = ?");
            $stmt->execute([$id, $_SESSION['user']['username']]);
        }
        if ($stmt->rowCount() === 0) {
            echo json_encode(['success' => false, 'message' => 'Record not found or access denied']);
            return;
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete deposit']);
    }
}

// ── SAVE ID PHOTO (separate endpoint for large base64 payloads) ──
function saveIdPhoto() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id = intval($data['id'] ?? 0);
    $photo = $data['id_photo'] ?? '';

    if ($id <= 0 || empty($photo)) {
        echo json_encode(['success' => false, 'message' => 'Missing id or photo']);
        return;
    }

    // Auto-add column if missing
    try { $pdo->exec("ALTER TABLE rental_logs ADD COLUMN id_photo MEDIUMTEXT NULL"); } catch(PDOException $ignored) {}

    try {
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("UPDATE rental_logs SET id_photo = ? WHERE id = ?");
            $stmt->execute([$photo, $id]);
        } else {
            $stmt = $pdo->prepare("UPDATE rental_logs SET id_photo = ? WHERE id = ? AND employee_username = ?");
            $stmt->execute([$photo, $id, $_SESSION['user']['username']]);
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

?>