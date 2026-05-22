<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// Small JSON response helper so every exit path returns the same shape.
function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Database credentials live outside the repo so secrets never get committed.
function readConfig(): array
{
    $configFile = '/etc/crm-prototype-db.php';
    if (!is_file($configFile)) {
        throw new RuntimeException('Database config is missing.');
    }

    require $configFile;

    foreach (['CRM_DB_DSN', 'CRM_DB_USER', 'CRM_DB_PASS'] as $name) {
        if (!defined($name)) {
            throw new RuntimeException("Missing config value: {$name}");
        }
    }

    return [
        'dsn' => CRM_DB_DSN,
        'user' => CRM_DB_USER,
        'pass' => CRM_DB_PASS,
    ];
}

// Open a PDO connection and make sure the app table exists before any read/write.
function pdo(): PDO
{
    $config = readConfig();
    $pdo = new PDO(
        $config['dsn'],
        $config['user'],
        $config['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS crm_state (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            customers LONGTEXT NOT NULL,
            ui_state LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    return $pdo;
}

// Stored values are JSON blobs, so this helper keeps bad JSON from crashing reads.
function decodeJson(string $value, array $fallback): array
{
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

// We keep a single row of app state: customer records plus UI preferences.
function loadState(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT customers, ui_state FROM crm_state WHERE id = 1 LIMIT 1');
    $row = $stmt->fetch();

    if (!$row) {
        return [
            'customers' => [],
            'uiState' => ['summaryMode' => false],
        ];
    }

    return [
        'customers' => decodeJson((string) $row['customers'], []),
        'uiState' => decodeJson((string) $row['ui_state'], ['summaryMode' => false]),
    ];
}

// Save the current customer list and UI settings back into that single row.
function saveState(PDO $pdo, array $payload): array
{
    $customers = $payload['customers'] ?? [];
    $uiState = $payload['uiState'] ?? ['summaryMode' => false];

    if (!is_array($customers) || !is_array($uiState)) {
        respond(400, ['ok' => false, 'error' => 'Invalid payload']);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO crm_state (id, customers, ui_state)
         VALUES (1, :customers, :ui_state)
         ON DUPLICATE KEY UPDATE
           customers = VALUES(customers),
           ui_state = VALUES(ui_state)'
    );

    $stmt->execute([
        ':customers' => json_encode($customers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':ui_state' => json_encode($uiState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);

    return [
        'customers' => $customers,
        'uiState' => $uiState,
    ];
}

try {
    // action=bootstrap loads data, action=save persists it, action=health checks the DB.
    $action = $_GET['action'] ?? 'bootstrap';
    $pdo = pdo();

    if ($action === 'health') {
        respond(200, ['ok' => true]);
    }

    if ($action === 'bootstrap') {
        respond(200, ['ok' => true] + loadState($pdo));
    }

    if ($action === 'save') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            respond(405, ['ok' => false, 'error' => 'Method not allowed']);
        }

        // Save expects JSON in the request body.
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: '[]', true);
        if (!is_array($body)) {
            respond(400, ['ok' => false, 'error' => 'Invalid JSON']);
        }

        respond(200, ['ok' => true] + saveState($pdo, $body));
    }

    respond(404, ['ok' => false, 'error' => 'Unknown action']);
} catch (Throwable $error) {
    // Keep database or runtime errors readable from the browser.
    respond(500, ['ok' => false, 'error' => $error->getMessage()]);
}
