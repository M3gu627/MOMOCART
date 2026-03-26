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
    
    $amount_cash = -1; $amount_gcash = -1;
    $additional_cash = 0; $additional_gcash = 0;

    if ($data['payment_method'] === 'Cash') {
        $amount_cash = $data['amount'];
        $additional_cash = $data['additional_charge'];
    } elseif ($data['payment_method'] === 'GCash') {
        $amount_gcash = $data['amount'];
        $additional_gcash = $data['additional_charge'];
    }

    try {
        $stmt = $pdo->prepare("
            INSERT INTO rental_logs (
                employee_username, name, waiver, or_number, cart_number,
                valid_id, time_in, time_out, return_status,
                amount_cash, amount_gcash, additional_cash, additional_gcash, 
                total, return_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $_SESSION['user']['username'],
            $data['name'],
            $data['waiver'],
            $data['or_number'],
            $data['cart_number'],
            $data['valid_id'],
            $data['time_in'],
            $data['time_out'],
            $data['return_status'],
            $amount_cash,
            $amount_gcash,
            $additional_cash,
            $additional_gcash,
            $data['total'],
            $data['return_time'] ?? ''
        ]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save log']);
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
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO expenses (employee_username, expense_date, particulars, amount)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([
            $_SESSION['user']['username'],
            $data['expense_date'],
            $data['particulars'],
            $data['amount']
        ]);
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        error_log($e->getMessage());
        echo json_encode(['success' => false, 'message' => 'Failed to save expense']);
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
?>