<?php
/* =========================
   HoyCredit S2S Postback → Google Ads (GCLID)
   v1.3 — dedupe + логирование + защита по токену
   ========================= */

// -------- CONFIG --------
const CONVERSION_ID    = 'AW-17445750344';     // из Google Ads: ID вида AW-123456789
const CONVERSION_LABEL = 'rEHiDOCjhLgBEM1M5P5A';// из Google Ads: Conversion label
const SHARED_SECRET    = 'hoyCREDIT-2025-SECURE';  // любой твой секрет для валидации постбека

$LOG_FILE   = __DIR__ . '/postback_log.txt';
$DEDUP_FILE = __DIR__ . '/postback_dedupe.db'; // плоская БД для дедупликации
$ALLOW_STATUSES = ['a']; // принимаем только A = approved
$DEFAULT_CURRENCY = 'MXN';

// -------- HELPERS --------
function log_line($msg) {
  global $LOG_FILE;
  @file_put_contents($LOG_FILE, date('Y-m-d H:i:s') . ' ' . $msg . "\n", FILE_APPEND);
}

function dedupe_seen($key) {
  global $DEDUP_FILE;
  if (!file_exists($DEDUP_FILE)) {
    @file_put_contents($DEDUP_FILE, "");
  }
  $h = fopen($DEDUP_FILE, 'c+');
  if (!$h) return false;
  flock($h, LOCK_EX);
  $content = stream_get_contents($h);
  if (strpos($content, $key) !== false) { fclose($h); return true; }
  fwrite($h, $key . "\n");
  fflush($h);
  flock($h, LOCK_UN);
  fclose($h);
  return false;
}

// -------- INPUT --------
// твой постбек ожидает такие параметры:
$token    = $_GET['token']    ?? '';
$gclid    = $_GET['sub1']     ?? $_GET['gclid'] ?? '';
$status   = strtolower($_GET['status'] ?? '');
$amount   = floatval($_GET['amount'] ?? 0);
$currency = strtoupper($_GET['currency'] ?? $DEFAULT_CURRENCY);
$txid     = $_GET['txid']     ?? $_GET['click_id'] ?? $_GET['lead_id'] ?? ''; // любой уникальный ID лида от партнёрки

// Базовые проверки
if ($token !== SHARED_SECRET) { http_response_code(403); echo 'BAD_TOKEN'; exit; }
if (empty($gclid))            { http_response_code(400); echo 'NO_GCLID';  exit; }
if (!in_array($status, $ALLOW_STATUSES, true)) { http_response_code(202); echo 'IGNORED_STATUS'; exit; }

// Дедупликация (на случай повторных постбеков)
$dedupe_key = sha1($gclid . '|' . $status . '|' . $txid);
if (dedupe_seen($dedupe_key)) { echo 'DUP'; exit; }

// -------- SEND to Google Ads --------
// классический серверный пинг по GCLID:
$google_url = sprintf(
  'https://www.google.com/pagead/conversion/%s/?label=%s&gclid=%s&value=%s&currency_code=%s&guid=ON&script=0',
  urlencode(CONVERSION_ID),
  urlencode(CONVERSION_LABEL),
  urlencode($gclid),
  number_format($amount, 2, '.', ''),
  urlencode($currency)
);

// запрос через cURL (надежнее, чем file_get_contents)
$ch = curl_init();
curl_setopt_array($ch, [
  CURLOPT_URL => $google_url,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 5,
  CURLOPT_USERAGENT => 'HoyCredit-Postback/1.3'
]);
$resp = curl_exec($ch);
$err  = curl_error($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Лог
log_line("GCLID=$gclid | STATUS=$status | AMOUNT=$amount $currency | TXID=$txid | HTTP=$http | RESP=" . trim((string)$resp));

// Ответ партнёрке
echo ($http >= 200 && $http < 300) ? 'OK' : 'FAIL';