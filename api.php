<?php
// filepath: c:\Users\User\iCloudDrive\Desktop\Plantillas-web\app-planificador-universitario\api.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');

$servername = "localhost"; // Cambia esto si tu servidor es diferente
$username = "root"; // Tu usuario de MySQL
$password = ""; // Tu contraseña de MySQL
$dbname = "planificador_universitario"; // Nombre de tu base de datos

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["error" => "Conexión fallida: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

switch ($method) {
    case 'GET':
        if (isset($_GET['table'])) {
            $table = $_GET['table'];
            $result = $conn->query("SELECT * FROM $table");
            $data = [];
            while ($row = $result->fetch_assoc()) {
                $data[] = $row;
            }
            echo json_encode($data);
        }
        break;

    case 'POST':
        if (isset($_GET['table'])) {
            $table = $_GET['table'];
            $columns = implode(", ", array_keys($input));
            $values = implode("', '", array_values($input));
            $sql = "INSERT INTO $table ($columns) VALUES ('$values')";
            if ($conn->query($sql) === TRUE) {
                echo json_encode(["success" => "Registro creado correctamente"]);
            } else {
                echo json_encode(["error" => "Error: " . $conn->error]);
            }
        }
        break;

    case 'PUT':
        if (isset($_GET['table']) && isset($_GET['id'])) {
            $table = $_GET['table'];
            $id = $_GET['id'];
            $updates = [];
            foreach ($input as $key => $value) {
                $updates[] = "$key='$value'";
            }
            $updates = implode(", ", $updates);
            $sql = "UPDATE $table SET $updates WHERE id=$id";
            if ($conn->query($sql) === TRUE) {
                echo json_encode(["success" => "Registro actualizado correctamente"]);
            } else {
                echo json_encode(["error" => "Error: " . $conn->error]);
            }
        }
        break;

    case 'DELETE':
        if (isset($_GET['table']) && isset($_GET['id'])) {
            $table = $_GET['table'];
            $id = $_GET['id'];
            $sql = "DELETE FROM $table WHERE id=$id";
            if ($conn->query($sql) === TRUE) {
                echo json_encode(["success" => "Registro eliminado correctamente"]);
            } else {
                echo json_encode(["error" => "Error: " . $conn->error]);
            }
        }
        break;
}

$conn->close();
?>