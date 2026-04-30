CREATE DATABASE IF NOT EXISTS cinenow_v2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE cinenow_v2;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS resenas;
DROP TABLE IF EXISTS funciones;
DROP TABLE IF EXISTS peliculas;
DROP TABLE IF EXISTS cines;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS configuracion;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol ENUM('admin','usuario') NOT NULL DEFAULT 'usuario',
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE cines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  region VARCHAR(120) NOT NULL,
  direccion VARCHAR(255) DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE peliculas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tmdb_id INT NULL UNIQUE,
  titulo VARCHAR(200) NOT NULL,
  genero VARCHAR(80) DEFAULT NULL,
  clasificacion VARCHAR(10) DEFAULT NULL,
  duracion VARCHAR(30) DEFAULT NULL,
  director VARCHAR(160) DEFAULT NULL,
  anio INT DEFAULT NULL,
  img VARCHAR(500) DEFAULT NULL,
  descripcion TEXT,
  trailer VARCHAR(500) DEFAULT NULL,
  estado ENUM('cartelera','proximamente','inactivo') NOT NULL DEFAULT 'cartelera',
  origen ENUM('manual','tmdb') NOT NULL DEFAULT 'manual',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE funciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pelicula_id INT NOT NULL,
  cine_id INT NOT NULL,
  horarios JSON NOT NULL,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0,
  fecha_inicio DATE DEFAULT NULL,
  fecha_fin DATE DEFAULT NULL,
  CONSTRAINT fk_funcion_pelicula FOREIGN KEY (pelicula_id) REFERENCES peliculas(id) ON DELETE CASCADE,
  CONSTRAINT fk_funcion_cine FOREIGN KEY (cine_id) REFERENCES cines(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE resenas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pelicula_id INT NOT NULL,
  usuario_id INT NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  texto TEXT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resena_pelicula FOREIGN KEY (pelicula_id) REFERENCES peliculas(id) ON DELETE CASCADE,
  CONSTRAINT fk_resena_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE configuracion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave VARCHAR(120) NOT NULL UNIQUE,
  valor LONGTEXT NOT NULL
) ENGINE=InnoDB;

INSERT INTO usuarios (nombre, email, password, rol, fecha) VALUES
('Admin CineNow', 'admin@cinenow.mx', '$2y$12$XKKIiYoM1fnijZNMyzsXM.IeVJHUpck/HcD0bIraQlvxlm2YIZGEq', 'admin', '2025-01-01 00:00:00'),
('Usuario Demo', 'demo@cinenow.mx', '$2y$12$MXxv/QW3TkOXh46UXTXb3uzmMOQbfZMsA0JS9D6EqirvT4OfMtDF6', 'usuario', '2025-03-01 00:00:00');

INSERT INTO cines (nombre, region, direccion, activo) VALUES
('Cinépolis Galerías', 'CDMX', 'Av. Insurgentes Sur 1602', 1),
('Cinemex Antara', 'CDMX', 'Av. Ejército Nacional 843', 1),
('Cinépolis VIP Andares', 'Guadalajara', 'Blvd. Puerta de Hierro 4965', 1),
('Cinemex Cumbres', 'Monterrey', 'Av. Las Torres 501', 1),
('Cineplanet Angelópolis', 'Puebla', 'Blvd. del Niño Poblano 2510', 1),
('Cinemex Toluca', 'Toluca', 'Paseo Tollocan 623', 1),
('Cinépolis Zacatecas', 'Zacatecas', 'Blvd. López Mateos 101', 1);

INSERT INTO peliculas (titulo, genero, clasificacion, duracion, director, anio, img, descripcion, trailer, estado, origen) VALUES
('El Caballero Oscuro', 'Acción', 'B15', '152 min', 'Christopher Nolan', 2008, 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', 'Batman se enfrenta al Joker, un criminal que sumerge a Ciudad Gótica en el caos.', 'https://www.youtube.com/watch?v=EXeTwQWrcwY', 'cartelera', 'manual'),
('Avatar: El Camino del Agua', 'Ciencia Ficción', 'B', '192 min', 'James Cameron', 2022, 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg', 'Jake Sully vive con su nueva familia en Pandora, pero una amenaza conocida regresa.', 'https://www.youtube.com/watch?v=d9MyW72ELq0', 'cartelera', 'manual'),
('Inception', 'Ciencia Ficción', 'B', '148 min', 'Christopher Nolan', 2010, 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg', 'Un ladrón que roba secretos corporativos a través de los sueños debe implantar una idea en la mente de un CEO.', 'https://www.youtube.com/watch?v=YoHD9XEInc0', 'cartelera', 'manual'),
('Interstellar', 'Ciencia Ficción', 'B', '169 min', 'Christopher Nolan', 2014, 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'Un grupo de exploradores viaja a través de un agujero de gusano en busca de un nuevo hogar para la humanidad.', 'https://www.youtube.com/watch?v=zSWdZVtXT7E', 'cartelera', 'manual'),
('Dune: Parte Dos', 'Ciencia Ficción', 'B15', '166 min', 'Denis Villeneuve', 2024, 'https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg', 'Paul Atreides se une a los Fremen y busca venganza contra los que destruyeron su familia.', 'https://www.youtube.com/watch?v=Way9Dexny3w', 'cartelera', 'manual'),
('Venom: El Último Baile', 'Acción', 'B15', '109 min', 'Kelly Marcel', 2024, 'https://image.tmdb.org/t/p/w500/aosm8NMQ3UyoBVpSxyimorCQykC.jpg', 'Eddie y Venom se enfrentan a un nuevo y letal enemigo mientras están en la carrera.', 'https://www.youtube.com/watch?v=wES5PZnNDkg', 'cartelera', 'manual'),
('Joker', 'Drama', 'C', '122 min', 'Todd Phillips', 2019, 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg', 'Arthur Fleck, un comediante fracasado, se sumerge en la locura y se convierte en el Joker.', 'https://www.youtube.com/watch?v=zAGVQLHvwOY', 'cartelera', 'manual'),
('Oppenheimer', 'Drama', 'B15', '180 min', 'Christopher Nolan', 2023, 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', 'El físico J. Robert Oppenheimer y su papel en el desarrollo de la bomba atómica.', 'https://www.youtube.com/watch?v=uYPbbksJxIg', 'proximamente', 'manual'),
('Spider-Man: No Way Home', 'Acción', 'B', '148 min', 'Jon Watts', 2021, 'https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg', 'Peter Parker pide ayuda a Doctor Strange cuando su identidad es revelada.', 'https://www.youtube.com/watch?v=JfVOs4VSpmA', 'proximamente', 'manual'),
('Barbie', 'Comedia', 'B', '114 min', 'Greta Gerwig', 2023, 'https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', 'Barbie y Ken viven en un mundo perfecto, hasta que deciden visitar el mundo real.', 'https://www.youtube.com/watch?v=pBk4NYhWNMM', 'cartelera', 'manual');

INSERT INTO funciones (pelicula_id, cine_id, horarios, precio, fecha_inicio, fecha_fin) VALUES
(1, 1, '["16:30","19:45","22:15"]', 85, '2025-03-01', '2025-04-30'),
(2, 3, '["15:00","18:30","21:50"]', 95, '2025-03-01', '2025-04-30'),
(3, 4, '["17:20","20:30","23:10"]', 80, '2025-03-01', '2025-04-30'),
(4, 2, '["14:45","18:15","21:30"]', 85, '2025-03-01', '2025-04-30'),
(5, 5, '["16:00","19:30","22:40"]', 90, '2025-03-01', '2025-04-30'),
(6, 6, '["15:30","18:45","21:55"]', 88, '2025-03-01', '2025-04-30'),
(6, 7, '["16:15","19:20","22:30"]', 85, '2025-03-01', '2025-04-30'),
(7, 1, '["15:00","18:30","21:45"]', 80, '2025-03-01', '2025-04-30'),
(8, 2, '["16:20","19:50","22:50"]', 90, '2025-05-01', '2025-06-30'),
(10, 3, '["14:30","17:45","21:10"]', 85, '2025-03-01', '2025-04-30'),
(1, 4, '["15:00","18:00","21:00"]', 80, '2025-03-01', '2025-04-30'),
(3, 7, '["16:00","19:00","22:00"]', 82, '2025-03-01', '2025-04-30');

INSERT INTO configuracion (clave, valor) VALUES
('app_name', 'CineNow'),
('tmdb_last_sync_at', ''),
('sync_interval_hours', '24');
