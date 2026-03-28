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
    case 'deleteLog':     deleteLog();        break;
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

    // Use Philippine time (UTC+8) for created_at
    $now = new DateTime('now', new DateTimeZone('Asia/Manila'));

    try {
        $stmt = $pdo->prepare("
            INSERT INTO rental_logs (
                employee_username, name, waiver, or_number, cart_number,
                valid_id, time_in, time_out, return_status,
                amount_cash, amount_gcash, additional_cash, additional_gcash, 
                total, return_time, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $_SESSION['user']['username'],
            $data['name'] ?? '',
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
            $now->format('Y-m-d H:i:s')
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

    // Default expense_date to today in PH time if not provided
    if (empty($data['expense_date'])) {
        $now = new DateTime('now', new DateTimeZone('Asia/Manila'));
        $data['expense_date'] = $now->format('Y-m-d');
    }
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO expenses (employee_username, expense_date, particulars, amount)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([
            $_SESSION['user']['username'],
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
        // Branch accounts can only delete their own records; admin can delete any
        if ($_SESSION['user']['role'] === 'admin') {
            $stmt = $pdo->prepare("DELETE FROM rental_logs WHERE id = ?");
            $stmt->execute([$id]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM rental_logs WHERE id = ? AND employee_username = ?");
            $stmt->execute([$id, $_SESSION['user']['username']]);
        }
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to delete record']);
    }
}
?>