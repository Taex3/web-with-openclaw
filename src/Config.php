<?php
declare(strict_types=1);

// โหลด config จากไฟล์นอก web root เพื่อไม่ให้ secrets หลุดขึ้น GitHub
function linebot_load_config(?string $path = null): array
{
    // ถ้าไม่ระบุ path ให้ดูจาก env ก่อน แล้วค่อย fallback ไปที่ไฟล์ server มาตรฐาน
    $path ??= getenv('LINEBOT_BOT_CONFIG') ?: '/etc/linebot-bot-config.php';
    if (!is_file($path)) {
        throw new RuntimeException('Missing config file: ' . $path);
    }

    // config file ต้อง return เป็น array
    $config = require $path;
    if (!is_array($config)) {
        throw new RuntimeException('Config file must return an array.');
    }

    // ตรวจว่าค่าที่จำเป็นมีครบก่อนเริ่มทำงาน
    foreach ([
        'openai_api_key',
        'assistant_id',
        'line_channel_secret',
        'line_channel_access_token',
    ] as $key) {
        if (!array_key_exists($key, $config) || $config[$key] === '') {
            throw new RuntimeException('Missing config key: ' . $key);
        }
    }

    return $config;
}
