<?php
declare(strict_types=1);

require __DIR__ . '/src/Config.php';

// ใช้แค่แสดงสถานะและบอก webhook URL ของบอท
$baseUrl = 'https://taex.openclaw-wo-yo.com/linebot-bot';
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LINE Bot Bridge</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f5f7fb;
            color: #1f2937;
        }
        .card {
            width: min(760px, calc(100vw - 32px));
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 18px;
            padding: 28px;
            box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
        }
        code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 6px;
        }
        .muted { color: #6b7280; }
    </style>
</head>
<body>
<div class="card">
    <h1>LINE Bot Bridge</h1>
    <p class="muted">This folder is deployed separately from the main site.</p>
    <ul>
        <li>Webhook: <code><?php echo htmlspecialchars($baseUrl . '/webhook.php', ENT_QUOTES, 'UTF-8'); ?></code></li>
        <li>Status: ready to receive LINE webhook requests</li>
    </ul>
    <p>Use <code>/webhook.php</code> in the LINE Developers console.</p>
</div>
</body>
</html>
