<?php
$host = 'localhost';
$dbname = 'u538916459_momocart_db';
$username = 'u538916459_momocart';
$password = 'MoMocartlogin123';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}
?>