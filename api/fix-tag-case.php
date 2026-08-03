<?php
// One-time-use tool: title-cases every existing tag name (e.g. "zucchini" -> "Zucchini").
// Safe to run more than once — already-correct names are just skipped.
// DELETE THIS FILE from the server as soon as you're done using it.

require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
header('Content-Type: text/plain; charset=utf-8');

// Title-cases a tag name, except: tokens already fully uppercase (likely
// acronyms like "BBQ" or "DUP") are left alone, and minor connector words
// ("and", "of", etc.) stay lowercase unless they're the first word.
function titleCaseTag(string $name): string {
  $minorWords = ['and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'with', 'for', 'to', 'at', 'by'];
  $words = preg_split('/\s+/', trim($name));
  $result = [];
  foreach ($words as $i => $word) {
    $letters = preg_replace('/[^A-Za-z]/', '', $word);
    if ($letters !== '' && $letters === mb_strtoupper($letters, 'UTF-8') && mb_strlen($letters, 'UTF-8') <= 5) {
      $result[] = $word;
      continue;
    }
    $lower = mb_strtolower($word, 'UTF-8');
    $result[] = ($i > 0 && in_array($lower, $minorWords, true)) ? $lower : mb_convert_case($word, MB_CASE_TITLE, 'UTF-8');
  }
  return implode(' ', $result);
}

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
$conn->set_charset('utf8mb4');

$rows = $conn->query('SELECT id, name FROM tags')->fetch_all(MYSQLI_ASSOC);

$updateStmt = $conn->prepare('UPDATE tags SET name = ? WHERE id = ?');
$changed = 0;

foreach ($rows as $row) {
  $titled = titleCaseTag($row['name']);
  if ($titled !== $row['name']) {
    $updateStmt->bind_param('si', $titled, $row['id']);
    $updateStmt->execute();
    echo "{$row['name']} -> {$titled}\n";
    $changed++;
  }
}
$updateStmt->close();

echo "\nDone. {$changed} of " . count($rows) . " tags updated.\n";
