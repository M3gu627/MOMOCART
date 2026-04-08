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
    // ── ATTENDANCE ──
    case 'timeIn':               handleTimeIn();          break;
    case 'timeOut':              handleTimeOut();         break;
    case 'getAttendance':        getAttendance();         break;
    case 'deleteAttendance':     deleteAttendance();      break;
    //-Qr code -
    case 'cartTimeIn':    cartTimeIn();    break;
    case 'cartTimeOut':   cartTimeOut();   break;
    case 'getCartLogs':   getCartLogs();   break;
    case 'deleteCartLog': deleteCartLog(); break;
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

    $role  = $_SESSION['user']['role'];
    $today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    $sql   = "SELECT *,
        CASE
            WHEN amount_cash > 0 THEN 'Cash'
            WHEN amount_gcash > 0 THEN 'GCash'
            ELSE 'Other'
        END as payment_method
        FROM rental_logs";

    try {
        if ($role === 'admin') {
            // Admin: respect ?date param.
            // date=all  → full history (summaries/export)
            // YYYY-MM-DD → that specific day
            // (none)     → today
            $requestedDate = isset($_GET['date']) ? trim($_GET['date']) : '';
            if ($requestedDate === 'all') {
                $stmt = $pdo->query($sql . " ORDER BY created_at DESC");
            } elseif ($requestedDate && preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDate)) {
                $stmt = $pdo->prepare($sql . " WHERE DATE(created_at) = ? ORDER BY created_at DESC");
                $stmt->execute([$requestedDate]);
            } else {
                $stmt = $pdo->prepare($sql . " WHERE DATE(created_at) = ? ORDER BY created_at DESC");
                $stmt->execute([$today]);
            }
        } else {
            // Branch: always today only, always their own records — enforced server-side.
            $stmt = $pdo->prepare($sql . "
                WHERE DATE(created_at) = ? AND employee_username = ?
                ORDER BY created_at DESC
            ");
            $stmt->execute([$today, $_SESSION['user']['username']]);
        }
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

    // Auto-add employee_name column if missing (safe guard)
    try { $pdo->exec("ALTER TABLE rental_logs ADD COLUMN employee_name VARCHAR(255) NULL DEFAULT ''"); } catch(PDOException $ignored) {}

    try {
        $stmt = $pdo->prepare("
            INSERT INTO rental_logs (
                employee_username, employee_name, name, address, waiver, or_number, cart_number,
                valid_id, time_in, time_out, return_status,
                amount_cash, amount_gcash, additional_cash, additional_gcash,
                total, return_time, created_at, id_photo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $effectiveUsername,
            $data['employee_name'] ?? '',
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
        // Return the new record ID so the client can do an optimistic update
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
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
            // Admin: verify record exists first (avoids rowCount=0 false-positive on unchanged data)
            $chk = $pdo->prepare("SELECT id FROM rental_logs WHERE id = ?");
            $chk->execute([$id]);
            if (!$chk->fetch()) {
                echo json_encode(['success' => false, 'message' => 'Record not found']);
                return;
            }
            $stmt = $pdo->prepare("
                UPDATE rental_logs SET
                    name = ?, employee_name = ?, address = ?, waiver = ?, or_number = ?, cart_number = ?,
                    valid_id = ?, time_in = ?, time_out = ?, return_time = ?,
                    amount_cash = ?, amount_gcash = ?,
                    additional_cash = ?, additional_gcash = ?,
                    total = ?, return_status = ?, id_photo = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['employee_name'] ?? '',
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
        } else {
            // Branch: verify ownership first (avoids rowCount=0 false-positive on unchanged data)
            $own = $pdo->prepare("SELECT id FROM rental_logs WHERE id = ? AND employee_username = ?");
            $own->execute([$id, $_SESSION['user']['username']]);
            if (!$own->fetch()) {
                echo json_encode(['success' => false, 'message' => 'Record not found or you do not have permission to edit it']);
                return;
            }
            $stmt = $pdo->prepare("
                UPDATE rental_logs SET
                    name = ?, employee_name = ?, address = ?, waiver = ?, or_number = ?, cart_number = ?,
                    valid_id = ?, time_in = ?, time_out = ?, return_time = ?,
                    amount_cash = ?, amount_gcash = ?,
                    additional_cash = ?, additional_gcash = ?,
                    total = ?, return_status = ?, id_photo = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $data['name'] ?? '',
                $data['employee_name'] ?? '',
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

// ── ENSURE ATTENDANCE TABLE EXISTS ──
function ensureAttendanceTable() {
    global $pdo;
    try {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS attendance (
                id               INT AUTO_INCREMENT PRIMARY KEY,
                branch           VARCHAR(50)  NOT NULL,
                name             VARCHAR(150) NOT NULL,
                time_in          DATETIME     NOT NULL,
                time_out         DATETIME     DEFAULT NULL,
                picture          LONGTEXT     DEFAULT NULL,
                timeout_picture  LONGTEXT     DEFAULT NULL,
                created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ALTER TABLE attendance ADD COLUMN IF NOT EXISTS timeout_picture LONGTEXT DEFAULT NULL;
        ");
    } catch (PDOException $e) { /* already exists */ }
}

// ── TIME IN ──
function handleTimeIn() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureAttendanceTable();

    $data    = json_decode(file_get_contents('php://input'), true);
    $name    = trim($data['name']    ?? '');
    $picture = $data['picture']      ?? null;
    $branch  = $_SESSION['user']['username'];

    if ($_SESSION['user']['role'] === 'admin' && !empty($data['branch'])) {
        $branch = trim($data['branch']);
    }

    if (!$name || !$branch) {
        echo json_encode(['success' => false, 'message' => 'Name and branch are required.']);
        return;
    }
    if (!$picture) {
        echo json_encode(['success' => false, 'message' => 'Picture is required.']);
        return;
    }

    $now   = new DateTime('now', new DateTimeZone('Asia/Manila'));
    $today = $now->format('Y-m-d');
    $stmt  = $pdo->prepare("
        SELECT id FROM attendance
        WHERE branch = ? AND name = ? AND DATE(time_in) = ? AND time_out IS NULL
        LIMIT 1
    ");
    $stmt->execute([$branch, $name, $today]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'message' => $name . ' has already timed in today. Please time out first.']);
        return;
    }

    $stmt = $pdo->prepare("INSERT INTO attendance (branch, name, time_in, picture) VALUES (?, ?, CONVERT_TZ(NOW(), '+00:00', '+08:00'), ?)");
    $stmt->execute([$branch, $name, $picture]);
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Time-in recorded successfully.']);
}

// ── TIME OUT ──
function handleTimeOut() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }

    $data            = json_decode(file_get_contents('php://input'), true);
    $id              = intval($data['id'] ?? 0);
    $timeout_picture = $data['timeout_picture'] ?? null;
    $branch          = $_SESSION['user']['username'];
    $role            = $_SESSION['user']['role'];

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID.']);
        return;
    }

    if (!$timeout_picture) {
        echo json_encode(['success' => false, 'message' => 'A time-out photo is required.']);
        return;
    }

    if ($role === 'admin') {
        $stmt = $pdo->prepare("UPDATE attendance SET time_out = CONVERT_TZ(NOW(), '+00:00', '+08:00'), timeout_picture = ? WHERE id = ? AND time_out IS NULL");
        $stmt->execute([$timeout_picture, $id]);
    } else {
        $stmt = $pdo->prepare("UPDATE attendance SET time_out = CONVERT_TZ(NOW(), '+00:00', '+08:00'), timeout_picture = ? WHERE id = ? AND branch = ? AND time_out IS NULL");
        $stmt->execute([$timeout_picture, $id, $branch]);
    }

    if ($stmt->rowCount() === 0) {
        echo json_encode(['success' => false, 'message' => 'Record not found or already timed out.']);
        return;
    }
    echo json_encode(['success' => true, 'message' => 'Time-out recorded successfully.']);
}

// ── GET ATTENDANCE ──
function getAttendance() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureAttendanceTable();

    $branch = $_SESSION['user']['username'];
    $role   = $_SESSION['user']['role'];
    $phNow  = new DateTime('now', new DateTimeZone('Asia/Manila'));
    $date   = $_GET['date'] ?? $phNow->format('Y-m-d');

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = $phNow->format('Y-m-d');
    }

    if ($role === 'admin') {
        $filterBranch = $_GET['branch'] ?? 'all';
        if ($filterBranch && $filterBranch !== 'all') {
            $stmt = $pdo->prepare("
                SELECT id, branch, name, time_in, time_out, picture, timeout_picture
                FROM attendance WHERE DATE(time_in) = ? AND branch = ?
                ORDER BY time_in DESC
            ");
            $stmt->execute([$date, $filterBranch]);
        } else {
            $stmt = $pdo->prepare("
                SELECT id, branch, name, time_in, time_out, picture, timeout_picture
                FROM attendance WHERE DATE(time_in) = ?
                ORDER BY branch, time_in DESC
            ");
            $stmt->execute([$date]);
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT id, branch, name, time_in, time_out, picture, timeout_picture
            FROM attendance WHERE DATE(time_in) = ? AND branch = ?
            ORDER BY time_in DESC
        ");
        $stmt->execute([$date, $branch]);
    }

    echo json_encode(['success' => true, 'records' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

// ── DELETE ATTENDANCE (admin only) ──
function deleteAttendance() {
    global $pdo;
    if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = intval($data['id'] ?? 0);

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Invalid ID.']);
        return;
    }

    $stmt = $pdo->prepare("DELETE FROM attendance WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['success' => true, 'message' => 'Record deleted.']);
}

// ── ENSURE CART LOGS TABLE EXISTS ──
function ensureCartLogsTable() {
    global $pdo;
    // Create table if it doesn't exist yet
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS cart_logs (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            branch           VARCHAR(50)  NOT NULL,
            cart_num         VARCHAR(20)  NOT NULL,
            cart_type        VARCHAR(30)  NOT NULL,
            duration         VARCHAR(20)  DEFAULT NULL,
            id_type          VARCHAR(20)  DEFAULT 'regular',
            time_in          DATETIME     NOT NULL,
            time_out         DATETIME     DEFAULT NULL,
            overtime_minutes INT          DEFAULT NULL,
            log_date         DATE         NOT NULL,
            created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    // Add columns if table already existed without them (safe to ignore duplicate-column errors)
    try { $pdo->exec("ALTER TABLE cart_logs ADD COLUMN duration VARCHAR(20) DEFAULT NULL"); } catch(PDOException $e) {}
    try { $pdo->exec("ALTER TABLE cart_logs ADD COLUMN id_type VARCHAR(20) DEFAULT 'regular'"); } catch(PDOException $e) {}
}

// ── CART TIME IN ──
// POST: { cartNum, cartType }
function cartTimeIn() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureCartLogsTable();

    $data     = json_decode(file_get_contents('php://input'), true);
    $cartNum  = trim($data['cartNum']  ?? '');
    $cartType = trim($data['cartType'] ?? '');
    $duration = trim($data['duration'] ?? '');
    $idType   = trim($data['idType']   ?? 'regular');

    $validDurations = ['15kiddie','30','60','120','180','unlimited'];
    $validIdTypes   = ['regular','senior','pwd'];
    if (!in_array($duration, $validDurations)) $duration = '';
    if (!in_array($idType,   $validIdTypes))   $idType   = 'regular';

    if (!$cartNum || !$cartType || !$duration) {
        echo json_encode(['success' => false, 'message' => 'cartNum, cartType, and duration are required.']);
        return;
    }

    // Branch comes from session (same as attendance)
    $branch = $_SESSION['user']['username'];
    if ($_SESSION['user']['role'] === 'admin' && !empty($data['branch'])) {
        $branch = trim($data['branch']);
    }

    $today = (new DateTime('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');

    try {
        // Prevent duplicate active entry for same cart today
        $check = $pdo->prepare("
            SELECT id FROM cart_logs
            WHERE branch = ? AND cart_num = ? AND log_date = ? AND time_out IS NULL
            LIMIT 1
        ");
        $check->execute([$branch, $cartNum, $today]);
        if ($check->fetch()) {
            echo json_encode(['success' => false, 'message' => $cartNum . ' is already checked in.']);
            return;
        }

        $stmt = $pdo->prepare("
            INSERT INTO cart_logs (branch, cart_num, cart_type, duration, id_type, time_in, log_date)
            VALUES (?, ?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+08:00'), ?)
        ");
        $stmt->execute([$branch, $cartNum, $cartType, $duration, $idType, $today]);

        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId(), 'message' => 'Time In recorded.']);
    } catch (PDOException $e) {
        error_log('cartTimeIn error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Database error saving Time In.']);
    }
}

// ── CART TIME OUT ──
// POST: { id }
function cartTimeOut() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureCartLogsTable();

    $data   = json_decode(file_get_contents('php://input'), true);
    $id     = intval($data['id'] ?? 0);
    $branch = $_SESSION['user']['username'];
    $role   = $_SESSION['user']['role'];

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Invalid record ID.']);
        return;
    }

    // Fetch the record to calculate overtime
    if ($role === 'admin') {
        $fetch = $pdo->prepare("SELECT * FROM cart_logs WHERE id = ? AND time_out IS NULL");
        $fetch->execute([$id]);
    } else {
        $fetch = $pdo->prepare("SELECT * FROM cart_logs WHERE id = ? AND branch = ? AND time_out IS NULL");
        $fetch->execute([$id, $branch]);
    }
    $record = $fetch->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        echo json_encode(['success' => false, 'message' => 'Record not found or already returned.']);
        return;
    }

    // Calculate overtime based on the session duration chosen at Time In
    try {
        $timeIn      = new DateTime($record['time_in']);
        $now         = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $diffMinutes = (int) round(($now->getTimestamp() - $timeIn->getTimestamp()) / 60);
        $durationLimits = ['15kiddie'=>15,'30'=>30,'60'=>60,'120'=>120,'180'=>180,'unlimited'=>99999];
        $SESSION_LIMIT  = $durationLimits[$record['duration'] ?? '60'] ?? 60;
        $overtimeMin    = max(0, $diffMinutes - $SESSION_LIMIT);

        if ($role === 'admin') {
            $stmt = $pdo->prepare("
                UPDATE cart_logs
                SET time_out = CONVERT_TZ(NOW(), '+00:00', '+08:00'), overtime_minutes = ?
                WHERE id = ? AND time_out IS NULL
            ");
            $stmt->execute([$overtimeMin > 0 ? $overtimeMin : null, $id]);
        } else {
            $stmt = $pdo->prepare("
                UPDATE cart_logs
                SET time_out = CONVERT_TZ(NOW(), '+00:00', '+08:00'), overtime_minutes = ?
                WHERE id = ? AND branch = ? AND time_out IS NULL
            ");
            $stmt->execute([$overtimeMin > 0 ? $overtimeMin : null, $id, $branch]);
        }

        if ($stmt->rowCount() === 0) {
            echo json_encode(['success' => false, 'message' => 'Could not update record.']);
            return;
        }

        echo json_encode([
            'success'          => true,
            'overtime_minutes' => $overtimeMin > 0 ? $overtimeMin : null,
            'message'          => 'Time Out recorded.'
        ]);
    } catch (PDOException $e) {
        error_log('cartTimeOut error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Database error saving Time Out.']);
    }
}

// ── GET CART LOGS ──
// GET: ?action=getCartLogs&date=YYYY-MM-DD[&branch=xxx]
function getCartLogs() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureCartLogsTable();

    $role   = $_SESSION['user']['role'];
    $branch = $_SESSION['user']['username'];
    $date   = $_GET['date'] ?? date('Y-m-d');

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        $date = date('Y-m-d');
    }

    try {
        if ($role === 'admin') {
            $filterBranch = $_GET['branch'] ?? 'all';
            if ($filterBranch && $filterBranch !== 'all') {
                $stmt = $pdo->prepare("
                    SELECT * FROM cart_logs
                    WHERE log_date = ? AND branch = ?
                    ORDER BY time_in DESC
                ");
                $stmt->execute([$date, $filterBranch]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT * FROM cart_logs
                    WHERE log_date = ?
                    ORDER BY branch, time_in DESC
                ");
                $stmt->execute([$date]);
            }
        } else {
            $stmt = $pdo->prepare("
                SELECT * FROM cart_logs
                WHERE log_date = ? AND branch = ?
                ORDER BY time_in DESC
            ");
            $stmt->execute([$date, $branch]);
        }

        echo json_encode(['success' => true, 'records' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } catch (PDOException $e) {
        error_log('getCartLogs error: ' . $e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Database error loading records.']);
    }
}

// ── DELETE CART LOG (admin only) ──
// POST: { id }
function deleteCartLog() {
    global $pdo;
    if (!isset($_SESSION['user'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Unauthorized']);
        return;
    }
    ensureCartLogsTable();

    $data = json_decode(file_get_contents('php://input'), true);
    $id   = intval($data['id'] ?? 0);

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'Invalid ID.']);
        return;
    }

    // Branch accounts can only delete their own records; admin can delete any
    if ($_SESSION['user']['role'] === 'admin') {
        $stmt = $pdo->prepare("DELETE FROM cart_logs WHERE id = ?");
        $stmt->execute([$id]);
    } else {
        $stmt = $pdo->prepare("DELETE FROM cart_logs WHERE id = ? AND branch = ?");
        $stmt->execute([$id, $_SESSION['user']['username']]);
    }

    if ($stmt->rowCount() === 0) {
        echo json_encode(['success' => false, 'message' => 'Record not found or access denied.']);
        return;
    }

    echo json_encode(['success' => true, 'message' => 'Record deleted.']);
}

?>