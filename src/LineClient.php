<?php
declare(strict_types=1);

namespace LineBot;

final class LineClient
{
    public function __construct(
        private string $channelSecret,
        private string $channelAccessToken
    ) {
    }

    public function isValidSignature(string $body, string $signature): bool
    {
        // LINE ใช้ HMAC-SHA256 เพื่อยืนยันว่า webhook request มาจากของจริง
        $expected = base64_encode(hash_hmac('sha256', $body, $this->channelSecret, true));
        return hash_equals($expected, $signature);
    }

    public function replyText(string $replyToken, string $text): void
    {
        // ส่งข้อความกลับไปที่ LINE ด้วย reply token ที่ได้จาก webhook event
        $this->requestJson('POST', 'https://api.line.me/v2/bot/message/reply', [
            'replyToken' => $replyToken,
            'messages' => [
                [
                    'type' => 'text',
                    'text' => $text,
                ],
            ],
        ]);
    }

    private function requestJson(string $method, string $url, array $payload): array
    {
        // ใช้ cURL เรียก LINE Messaging API
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('Unable to initialize cURL.');
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('Failed to encode JSON payload.');
        }

        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $this->channelAccessToken,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_TIMEOUT => 20,
        ]);

        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException('LINE API request failed: ' . $error);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        // ถ้า HTTP ไม่ใช่ 2xx ให้โยน error ออกไปทันที
        if ($status < 200 || $status >= 300) {
            throw new \RuntimeException('LINE API returned HTTP ' . $status . ': ' . $response);
        }

        if ($response === '') {
            return [];
        }

        $decoded = json_decode($response, true);
        return is_array($decoded) ? $decoded : [];
    }
}
