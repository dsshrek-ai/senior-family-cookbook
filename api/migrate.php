<?php
// One-time-use tool: imports recipes from the old Google Apps Script API into
// the new database, under collection = 'senior-family'.
// DELETE THIS FILE from the server as soon as you're done using it.

require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
header('Content-Type: text/plain; charset=utf-8');

const SOURCE_URL = 'https://script.google.com/macros/s/AKfycbzJ_eW_3TyedpTFM8ZkK7FePZ9iaWNR6plK-RoKYvEbF8RNNkdTb0KV90kuJHtQZeh7iQ/exec?action=getAllRecipes';
const COLLECTION = 'senior-family';

$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
$conn->set_charset('utf8mb4');

$existing = $conn->query("SELECT COUNT(*) AS c FROM recipes WHERE collection = '" . COLLECTION . "'")->fetch_assoc();
if ((int)$existing['c'] > 0 && !isset($_GET['force'])) {
  die("Already have {$existing['c']} recipes in the '" . COLLECTION . "' collection. "
    . "Add ?force=1 to the URL to import anyway (this will create duplicates).\n");
}

$json = file_get_contents(SOURCE_URL);
if ($json === false) {
  die("Failed to fetch source data from Apps Script URL.\n");
}
$data = json_decode($json, true);
$recipes = $data['recipes'] ?? [];
if (empty($recipes)) {
  die("No recipes found in source data.\n");
}

function syncTagsFor(mysqli $conn, int $recipeId, string $tagsCsv): void {
  foreach (array_map('trim', explode(',', $tagsCsv)) as $name) {
    if ($name === '') {
      continue;
    }
    $ins = $conn->prepare('INSERT IGNORE INTO tags (name) VALUES (?)');
    $ins->bind_param('s', $name);
    $ins->execute();
    $ins->close();

    $sel = $conn->prepare('SELECT id FROM tags WHERE name = ?');
    $sel->bind_param('s', $name);
    $sel->execute();
    $tagId = (int)$sel->get_result()->fetch_assoc()['id'];
    $sel->close();

    $link = $conn->prepare('INSERT IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');
    $link->bind_param('ii', $recipeId, $tagId);
    $link->execute();
    $link->close();
  }
}

$insertStmt = $conn->prepare(
  'INSERT INTO recipes (name, collection, base_servings, story, nutrition, ingredients, steps)
   VALUES (?, ?, ?, ?, ?, ?, ?)'
);

$imported = 0;
foreach ($recipes as $r) {
  $name = (string)($r['name'] ?? '');
  if ($name === '') {
    continue;
  }
  $collection = COLLECTION;
  $baseServings = isset($r['baseServings']) ? (int)$r['baseServings'] : null;
  $story = (string)($r['story'] ?? '');
  $nutrition = (string)($r['nutrition'] ?? '');
  $ingredients = json_encode($r['ingredients'] ?? []);
  $steps = json_encode($r['steps'] ?? []);

  $insertStmt->bind_param(
    'ssissss',
    $name, $collection, $baseServings, $story, $nutrition, $ingredients, $steps
  );
  $insertStmt->execute();
  $newId = $insertStmt->insert_id;

  syncTagsFor($conn, $newId, (string)($r['tags'] ?? ''));
  $imported++;
}
$insertStmt->close();

echo "Imported {$imported} recipes into collection '" . COLLECTION . "'.\n";
