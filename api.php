<?php
/* Squeek Leg Day, the one server-side piece.

   Two Squeekchain endpoints matter and neither is readable from a static page:

     api.squeekchain.com/v1/accounts/<0x...>          Squeek tokens in a wallet
     community.squeekchain.com/v1/community/profiles/<code>   badges and Aura

   The first sends `Access-Control-Allow-Origin: *` and is fetched straight from
   the browser. The second only allows `https://squeekchain.com`, so a browser
   on any other origin is blocked by CORS. This file fetches it server-side and
   hands the JSON back, which is all a proxy is for.

   Rules it keeps:

   - Read-only. Only GET, only those two hosts, only those two path shapes.
   - Nothing is stored. No database, no log, no cache file. The response goes
     straight back out.
   - No key of any kind. Both endpoints are public.
   - If the upstream is slow or down, it says so instead of inventing a body. */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// the page is served from this same host, but a local dev copy on another port
// is useful, and there is nothing private here to leak
header('Access-Control-Allow-Origin: *');

const TIMEOUT = 8;

function fail(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES);
    exit;
}

function get_json(string $url): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT        => TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT      => 'squeeklegday/1.0 (+https://squeekchain.com)',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        fail(502, 'upstream did not answer: ' . $err);
    }
    if ($code === 404 || $code === 400) {
        fail(404, 'not found upstream');
    }
    if ($code < 200 || $code >= 300) {
        fail(502, 'upstream answered ' . $code);
    }
    $data = json_decode((string) $body, true);
    if (!is_array($data)) {
        fail(502, 'upstream sent something unreadable');
    }
    return $data;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    fail(405, 'only GET');
}

$q = trim((string) ($_GET['q'] ?? ''));
if ($q === '') {
    fail(400, 'pass ?q=<0x address or member code>');
}

// an address: Squeek tokens held by that wallet
if (preg_match('/^0x[0-9a-fA-F]{40}$/', $q) === 1) {
    $data = get_json('https://api.squeekchain.com/v1/accounts/' . strtolower($q));
    if (($data['status'] ?? '') === 'unavailable') {
        fail(503, 'the indexer has not caught up with that address yet');
    }
    $counts = is_array($data['tokenCounts'] ?? null) ? $data['tokenCounts'] : [];
    $tokens = is_array($data['tokens'] ?? null) ? $data['tokens'] : [];
    $best   = 0;
    foreach ($tokens as $t) {
        $best = max($best, (int) ($t['level'] ?? 0));
    }
    echo json_encode([
        'kind'      => 'wallet',
        'address'   => strtolower($q),
        'wallet'    => (int) ($counts['wallet'] ?? 0),
        'staking'   => (int) ($counts['staking'] ?? 0),
        'bestLevel' => $best,
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

// a member code: every badge the profile carries, across all lanes
if (preg_match('/^[a-z0-9]{6,12}$/i', $q) === 1) {
    $data = get_json('https://community.squeekchain.com/v1/community/profiles/' . strtolower($q));
    if (($data['valid'] ?? false) !== true) {
        fail(404, 'no member with that code');
    }
    $badges = [];
    foreach (($data['achievements'] ?? []) as $a) {
        if (!is_array($a) || !isset($a['id'])) {
            continue;
        }
        $badges[] = [
            'id'      => (string) $a['id'],
            'title'   => (string) ($a['title'] ?? $a['id']),
            'holders' => (int) ($a['rarity']['holders'] ?? 0),
        ];
    }
    $standing = is_array($data['standing'] ?? null) ? $data['standing'] : [];
    echo json_encode([
        'kind'      => 'member',
        'code'      => strtolower($q),
        'aura'      => (int) ($standing['aura'] ?? 0),
        'rank'      => (int) ($standing['rank'] ?? 0),
        'badges'    => $badges,
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

fail(400, 'that is neither a 0x address nor a member code');
