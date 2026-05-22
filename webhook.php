<?php
declare(strict_types=1);

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/LineClient.php';
require __DIR__ . '/src/OpenAIClient.php';

use LineBot\LineClient;
use LineBot\OpenAIClient;

header('Content-Type: text/plain; charset=utf-8');

// LINE จะส่ง webhook มาแบบ POST เท่านั้น
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo "Method Not Allowed";
    exit;
}

try {
    // โหลดค่า secret / token / assistant id จากไฟล์ config ฝั่ง server
    $config = linebot_load_config();

    // อ่าน raw body และ signature ที่ LINE ส่งมาให้ตรวจสอบความถูกต้อง
    $body = file_get_contents('php://input') ?: '';
    $signature = $_SERVER['HTTP_X_LINE_SIGNATURE'] ?? '';

    // ตัวช่วยคุยกับ LINE API
    $line = new LineClient(
        $config['line_channel_secret'],
        $config['line_channel_access_token']
    );

    // ถ้าลายเซ็นไม่ตรง แปลว่าคำขอไม่มาจาก LINE จริง
    if (!$line->isValidSignature($body, $signature)) {
        http_response_code(400);
        echo "Invalid signature";
        exit;
    }

    // แปลง JSON payload เป็น array เพื่อไล่ event ทีละตัว
    $payload = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

    // ตัวช่วยเรียก OpenAI Assistants API
    $openai = new OpenAIClient(
        $config['openai_api_key'],
        $config['assistant_id']
    );

    // LINE 1 webhook อาจมีหลาย event ในครั้งเดียว จึงวนทีละรายการ
    foreach (($payload['events'] ?? []) as $event) {
        // เราสนใจเฉพาะ event ประเภท message เท่านั้น
        if (($event['type'] ?? '') !== 'message') {
            continue;
        }

        $message = $event['message'] ?? [];
        // ตอบเฉพาะข้อความ text เพื่อให้ logic ง่ายและชัด
        if (($message['type'] ?? '') !== 'text') {
            continue;
        }

        $replyToken = $event['replyToken'] ?? '';
        $inputText = (string) ($message['text'] ?? '');

        // ถ้าไม่มี token หรือไม่มีข้อความ ก็ไม่ต้องทำอะไรต่อ
        if ($replyToken === '' || $inputText === '') {
            continue;
        }

        // ส่งข้อความผู้ใช้ไปให้ AI แล้วเอาคำตอบกลับไปตอบ LINE
        $outputText = $openai->askAssistant($inputText);
        $line->replyText($replyToken, $outputText);
    }

    echo "OK";
} catch (Throwable $e) {
    // เก็บ error ไว้ใน log ฝั่ง server เพื่อ debug ภายหลัง
    error_log('linebot-bot error: ' . $e->getMessage());
    http_response_code(500);
    echo "ERROR";
}
