<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

require_once 'config.php';

$action = $_GET['action'] ?? '';

switch($action) {
    case 'login':
        handleLogin();
        break;
    case 'getLogs':
        getLogs();
        break;
    case 'saveLog':
        saveLog();
        break;
    case 'logout':
        logout();
        break;
    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}

function handleLogin() {
    global $pdo;
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user && ($user['password'] === $password || password_verify($password, $user['password']))) {
            session_start();
            $_SESSION['user'] = [
                'username' => $user['username'],
                'role' => $user['role'],
                'displayName' => $user['display_name'],
                'avatar' => $user['avatar']
            ];
            echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        }
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function getLogs() {
    global $pdo;
    session_start();
    
    if (!isset($_SESSION['user'])) {
        echo json_encode(['error' => 'Not logged in']);
        return;
    }
    
    $currentUser = $_SESSION['user'];
    
    try {
        if ($currentUser['role'] === 'admin') {
            $stmt = $pdo->query("SELECT * FROM rental_logs ORDER BY id DESC");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM rental_logs WHERE employee_username = ? ORDER BY id DESC");
            $stmt->execute([$currentUser['username']]);
        }
        
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($logs);
    } catch(PDOException $e) {
        echo json_encode(['error' => $e->getMessage()]);
    }
}

function saveLog() {
    global $pdo;
    session_start();
    
    if (!isset($_SESSION['user'])) {
        echo json_encode(['success' => false, 'message' => 'Not logged in']);
        return;
    }
    
    $data = json_decode(file_get_contents('php://input'), true);
    
    try {
        $stmt = $pdo->prepare("
            INSERT INTO rental_logs (
                employee_username, name, waiver, or_number, cart_number, 
                valid_id, time_in, time_out, return_status, 
                amount_cash, amount_gcash, additional_cash, additional_gcash, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            $data['amount_cash'],
            $data['amount_gcash'],
            $data['additional_cash'],
            $data['additional_gcash'],
            $data['total']
        ]);
        
        echo json_encode(['success' => true]);
    } catch(PDOException $e) {
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
}

function logout() {
    session_start();
    session_destroy();
    echo json_encode(['success' => true]);
}
?>