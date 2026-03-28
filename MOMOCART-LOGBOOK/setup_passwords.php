<?php
/**
 * MOMOCart - One-Time Password Setup Script
 * 
 * HOW TO USE:
 * 1. Upload this file to your server (same folder as api.php)
 * 2. Open it in your browser: http://yoursite.com/setup_passwords.php
 * 3. DELETE this file immediately after running it!
 * 
 * ⚠️  DO NOT leave this file on your server after use.
 */

require_once 'config.php';

// ── Define all users and their passwords here ──
$users = [
    [
        'username'     => 'pampanga',
        'password'     => 'momocartpampanga_123',
        'role'         => 'employee',
        'display_name' => 'Pampanga Branch',
    ],
    [
        'username'     => 'baliwag',
        'password'     => 'momocartbaliwag_123',
        'role'         => 'employee',
        'display_name' => 'Baliwag Branch',
    ],
    [
        'username'     => 'trinoma',
        'password'     => 'momocartrinoma_123',
        'role'         => 'employee',
        'display_name' => 'Trinoma Branch',
    ],
     
    [
         'username'     => 'admin',
         'password'     => 'momocartadmin_123',
         'role'         => 'admin',
         'display_name' => 'Admin',
    ],
];

// ── Create users table if it doesn't exist ──
$pdo->exec("
    CREATE TABLE IF NOT EXISTS users (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        username     VARCHAR(50) UNIQUE NOT NULL,
        password     VARCHAR(255) NOT NULL,
        role         VARCHAR(20) NOT NULL DEFAULT 'employee',
        display_name VARCHAR(100) NOT NULL
    )
");

$results = [];

foreach ($users as $user) {
    $hashed = password_hash($user['password'], PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("
        INSERT INTO users (username, password, role, display_name)
        VALUES (:username, :password, :role, :display_name)
        ON DUPLICATE KEY UPDATE
            password     = VALUES(password),
            role         = VALUES(role),
            display_name = VALUES(display_name)
    ");

    $stmt->execute([
        ':username'     => $user['username'],
        ':password'     => $hashed,
        ':role'         => $user['role'],
        ':display_name' => $user['display_name'],
    ]);

    $results[] = [
        'username' => $user['username'],
        'status'   => 'OK ✓',
    ];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>MOMOCart Password Setup</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-900 flex items-center justify-center p-6">
    <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div class="text-center mb-6">
            <div class="text-4xl mb-2">🛵</div>
            <h1 class="text-2xl font-bold text-slate-800">Password Setup Complete</h1>
            <p class="text-slate-400 text-sm mt-1">All passwords have been hashed and saved.</p>
        </div>

        <table class="w-full text-sm mb-6">
            <thead>
                <tr class="border-b">
                    <th class="text-left py-2 text-slate-500 font-semibold">Username</th>
                    <th class="text-left py-2 text-slate-500 font-semibold">Status</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($results as $r): ?>
                <tr class="border-b border-slate-100">
                    <td class="py-3 font-mono font-bold text-slate-700"><?= htmlspecialchars($r['username']) ?></td>
                    <td class="py-3 text-emerald-600 font-bold"><?= $r['status'] ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p class="text-red-700 font-bold text-sm">⚠️ DELETE THIS FILE NOW</p>
            <p class="text-red-500 text-xs mt-1">Remove <code>setup_passwords.php</code> from your server immediately.</p>
        </div>
    </div>
</body>
</html>