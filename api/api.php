<?php
require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

function respond($data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data);
  exit;
}

function fail(string $message, int $status = 400): void {
  respond(['success' => false, 'error' => $message], $status);
}

function db(): mysqli {
  static $conn = null;
  if ($conn === null) {
    try {
      $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
      $conn->set_charset('utf8mb4');
    } catch (mysqli_sql_exception $e) {
      fail('Database connection failed', 500);
    }
  }
  return $conn;
}

function jsonBody(): array {
  $raw = file_get_contents('php://input');
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

// ---- Auth helpers ----

function requireUser(): array {
  $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
    fail('Missing or invalid Authorization header', 401);
  }
  $token = $m[1];

  $stmt = db()->prepare(
    'SELECT u.id, u.username, u.display_name, u.collection
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()'
  );
  $stmt->bind_param('s', $token);
  $stmt->execute();
  $result = $stmt->get_result()->fetch_assoc();
  $stmt->close();

  if (!$result) {
    fail('Session expired or invalid — please log in again', 401);
  }
  return $result;
}

// A user with collection === null may edit any collection; otherwise they're
// restricted to editing only their own.
function requireCollectionAccess(array $user, string $collection): void {
  if ($user['collection'] !== null && $user['collection'] !== $collection) {
    fail('You are not authorized to edit this cookbook', 403);
  }
}

function recipeCollection(int $recipeId): string {
  $stmt = db()->prepare('SELECT collection FROM recipes WHERE id = ?');
  $stmt->bind_param('i', $recipeId);
  $stmt->execute();
  $row = $stmt->get_result()->fetch_assoc();
  $stmt->close();
  if (!$row) {
    fail('Recipe not found', 404);
  }
  return $row['collection'];
}

// ---- Recipe row shaping ----

function tagsForRecipe(int $recipeId): string {
  $stmt = db()->prepare(
    'SELECT t.name FROM tags t
     JOIN recipe_tags rt ON rt.tag_id = t.id
     WHERE rt.recipe_id = ?
     ORDER BY t.name'
  );
  $stmt->bind_param('i', $recipeId);
  $stmt->execute();
  $names = array_map(fn($row) => $row['name'], $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
  $stmt->close();
  return implode(', ', $names);
}

function shapeRecipe(array $row): array {
  return [
    'id'           => (int)$row['id'],
    'name'         => $row['name'],
    'collection'   => $row['collection'],
    'category'     => $row['category'],
    'baseServings' => $row['base_servings'] !== null ? (int)$row['base_servings'] : null,
    'prepTime'     => $row['prep_time'],
    'cookTime'     => $row['cook_time'],
    'totalTime'    => $row['total_time'],
    'tested'       => (bool)$row['tested'],
    'story'        => $row['story'],
    'nutrition'    => $row['nutrition'],
    'notes'        => $row['notes'],
    'ingredients'  => json_decode($row['ingredients'], true) ?? [],
    'steps'        => json_decode($row['steps'], true) ?? [],
    'tags'         => tagsForRecipe((int)$row['id']),
  ];
}

// ---- Tag syncing ----

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

function syncTags(int $recipeId, array $tagNames): void {
  $conn = db();
  $del = $conn->prepare('DELETE FROM recipe_tags WHERE recipe_id = ?');
  $del->bind_param('i', $recipeId);
  $del->execute();
  $del->close();

  foreach ($tagNames as $rawName) {
    $name = trim((string)$rawName);
    if ($name === '') {
      continue;
    }
    $name = titleCaseTag($name);

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

// ---- Validation ----

function recipeFieldsFromBody(array $body): array {
  if (empty(trim((string)($body['name'] ?? '')))) {
    fail('Recipe name is required');
  }
  return [
    'name'          => trim($body['name']),
    'collection'    => trim((string)($body['collection'] ?? 'senior-family')),
    'category'      => $body['category'] ?? null,
    'base_servings' => isset($body['baseServings']) ? (int)$body['baseServings'] : null,
    'prep_time'     => $body['prepTime'] ?? null,
    'cook_time'     => $body['cookTime'] ?? null,
    'total_time'    => $body['totalTime'] ?? null,
    'tested'        => !empty($body['tested']) ? 1 : 0,
    'story'         => $body['story'] ?? null,
    'nutrition'     => $body['nutrition'] ?? null,
    'notes'         => $body['notes'] ?? null,
    'ingredients'   => json_encode($body['ingredients'] ?? []),
    'steps'         => json_encode($body['steps'] ?? []),
    'tags'          => is_array($body['tags'] ?? null) ? $body['tags'] : [],
  ];
}

// ---- Router ----

$action = $_GET['action'] ?? '';

switch ($action) {

  case 'getAllRecipes': {
    $collection = $_GET['collection'] ?? null;
    if ($collection !== null) {
      $stmt = db()->prepare('SELECT * FROM recipes WHERE collection = ? ORDER BY name');
      $stmt->bind_param('s', $collection);
      $stmt->execute();
      $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
      $stmt->close();
    } else {
      $rows = db()->query('SELECT * FROM recipes ORDER BY name')->fetch_all(MYSQLI_ASSOC);
    }
    respond(['recipes' => array_map('shapeRecipe', $rows)]);
  }

  case 'getRecipe': {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = db()->prepare('SELECT * FROM recipes WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
      fail('Recipe not found', 404);
    }
    respond(['recipe' => shapeRecipe($row)]);
  }

  case 'login': {
    $body = jsonBody();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($username === '' || $password === '') {
      fail('Username and password are required');
    }

    $stmt = db()->prepare('SELECT id, password_hash, display_name, collection FROM users WHERE username = ?');
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user || !password_verify($password, $user['password_hash'])) {
      fail('Invalid username or password', 401);
    }

    $token = bin2hex(random_bytes(32));
    $days = SESSION_LIFETIME_DAYS;
    $ins = db()->prepare(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))'
    );
    $ins->bind_param('sii', $token, $user['id'], $days);
    $ins->execute();
    $ins->close();

    respond(['token' => $token, 'displayName' => $user['display_name'], 'collection' => $user['collection']]);
  }

  case 'logout': {
    $body = jsonBody();
    $token = (string)($body['token'] ?? '');
    if ($token !== '') {
      $stmt = db()->prepare('DELETE FROM sessions WHERE token = ?');
      $stmt->bind_param('s', $token);
      $stmt->execute();
      $stmt->close();
    }
    respond(['success' => true]);
  }

  case 'addRecipe': {
    $user = requireUser();
    $fields = recipeFieldsFromBody(jsonBody());
    requireCollectionAccess($user, $fields['collection']);

    $stmt = db()->prepare(
      'INSERT INTO recipes
       (name, collection, category, base_servings, prep_time, cook_time, total_time, tested, story, nutrition, notes, ingredients, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param(
      'sssisssisssss',
      $fields['name'], $fields['collection'], $fields['category'], $fields['base_servings'],
      $fields['prep_time'], $fields['cook_time'], $fields['total_time'], $fields['tested'],
      $fields['story'], $fields['nutrition'], $fields['notes'],
      $fields['ingredients'], $fields['steps']
    );
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    syncTags($newId, $fields['tags']);
    respond(['success' => true, 'id' => $newId]);
  }

  case 'updateRecipe': {
    $user = requireUser();
    $body = jsonBody();
    $id = (int)($body['id'] ?? 0);
    if ($id <= 0) {
      fail('Recipe id is required');
    }
    requireCollectionAccess($user, recipeCollection($id));
    $fields = recipeFieldsFromBody($body);
    requireCollectionAccess($user, $fields['collection']);

    $stmt = db()->prepare(
      'UPDATE recipes SET
         name = ?, collection = ?, category = ?, base_servings = ?, prep_time = ?, cook_time = ?, total_time = ?,
         tested = ?, story = ?, nutrition = ?, notes = ?, ingredients = ?, steps = ?
       WHERE id = ?'
    );
    $stmt->bind_param(
      'sssisssisssssi',
      $fields['name'], $fields['collection'], $fields['category'], $fields['base_servings'],
      $fields['prep_time'], $fields['cook_time'], $fields['total_time'], $fields['tested'],
      $fields['story'], $fields['nutrition'], $fields['notes'],
      $fields['ingredients'], $fields['steps'], $id
    );
    $stmt->execute();
    $stmt->close();

    syncTags($id, $fields['tags']);
    respond(['success' => true]);
  }

  case 'deleteRecipe': {
    $user = requireUser();
    $body = jsonBody();
    $id = (int)($body['id'] ?? 0);
    if ($id <= 0) {
      fail('Recipe id is required');
    }
    requireCollectionAccess($user, recipeCollection($id));
    $stmt = db()->prepare('DELETE FROM recipes WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    respond(['success' => true]);
  }

  default:
    fail('Unknown action', 404);
}
