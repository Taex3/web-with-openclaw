<?php
declare(strict_types=1);

namespace LineBot;

final class OpenAIClient
{
    public function __construct(
        private string $apiKey,
        private string $assistantId
    ) {
    }

    public function askAssistant(string $inputText): string
    {
        // 1) สร้าง thread ใหม่สำหรับข้อความนี้
        $thread = $this->request('POST', '/v1/threads', [
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $inputText,
                ],
            ],
        ]);

        $threadId = (string) ($thread['id'] ?? '');
        if ($threadId === '') {
            throw new \RuntimeException('Missing thread id from OpenAI.');
        }

        // 2) สั่ง assistant ให้ประมวลผล thread ที่เพิ่งสร้าง
        $run = $this->request('POST', "/v1/threads/{$threadId}/runs", [
            'assistant_id' => $this->assistantId,
        ]);

        $runId = (string) ($run['id'] ?? '');
        if ($runId === '') {
            throw new \RuntimeException('Missing run id from OpenAI.');
        }

        // 3) poll รอจนกว่าจะจบ
        $status = (string) ($run['status'] ?? '');
        $deadline = time() + 60;

        while ($status !== 'completed') {
            if (time() > $deadline) {
                throw new \RuntimeException('OpenAI run timed out.');
            }

            if (in_array($status, ['failed', 'cancelled', 'expired', 'requires_action'], true)) {
                throw new \RuntimeException('OpenAI run stopped with status: ' . $status);
            }

            sleep(2);
            $run = $this->request('GET', "/v1/threads/{$threadId}/runs/{$runId}");
            $status = (string) ($run['status'] ?? '');
        }

        // 4) ดึงข้อความทั้งหมด แล้วหา response จาก assistant ตัวล่าสุด
        $messages = $this->request('GET', "/v1/threads/{$threadId}/messages");

        foreach (($messages['data'] ?? []) as $message) {
            if (($message['role'] ?? '') !== 'assistant') {
                continue;
            }

            foreach (($message['content'] ?? []) as $content) {
                if (($content['type'] ?? '') === 'text') {
                    $text = (string) ($content['text']['value'] ?? '');
                    if ($text !== '') {
                        return $text;
                    }
                }
            }
        }

        throw new \RuntimeException('No assistant text was returned.');
    }

    private function request(string $method, string $path, ?array $payload = null): array
    {
        // wrapper กลางสำหรับเรียก OpenAI API ด้วย cURL
        $url = 'https://api.openai.com' . $path;
        $ch = curl_init($url);
        if ($ch === false) {
            throw new \RuntimeException('Unable to initialize cURL.');
        }

        $headers = [
            'Authorization: Bearer ' . $this->apiKey,
            'Content-Type: application/json',
            'OpenAI-Beta: assistants=v2',
        ];

        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 30,
        ];

        if ($payload !== null) {
            $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                throw new \RuntimeException('Failed to encode OpenAI payload.');
            }
            $options[CURLOPT_POSTFIELDS] = $json;
        }

        curl_setopt_array($ch, $options);

        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException('OpenAI request failed: ' . $error);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        $decoded = json_decode($response, true);
        // แปลง error response ของ OpenAI ให้อ่านง่ายขึ้นเวลา debug
        if ($status < 200 || $status >= 300) {
            $message = is_array($decoded) && isset($decoded['error']['message'])
                ? (string) $decoded['error']['message']
                : $response;
            throw new \RuntimeException('OpenAI API returned HTTP ' . $status . ': ' . $message);
        }

        if (!is_array($decoded)) {
            throw new \RuntimeException('OpenAI response was not valid JSON.');
        }

        return $decoded;
    }
}
