const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();  // Importar SQLite

const port = 3000;
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración de express-session
app.use(session({
    secret: 'mi_secreto',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // Cambiar a `true` si usas HTTPS
}));

app.use(express.static('public'));
app.use(express.json());

// Conectar con la base de datos SQLite
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite');
    }
});

// Crear la tabla de mensajes si no existe
db.run(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Endpoint para obtener los mensajes desde la base de datos
app.get('/messages', (req, res) => {
    db.all('SELECT * FROM messages ORDER BY timestamp ASC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ messages: rows });
    });
});

// Endpoint para guardar un mensaje en la base de datos
app.post('/messages', express.json(), (req, res) => {
    const { message, username } = req.body;
    const stmt = db.prepare('INSERT INTO messages (username, message) VALUES (?, ?)');
    stmt.run(username, message, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        io.emit('chat message', message, username);  // Emitir el mensaje a todos los clientes
        res.status(201).json({ success: true, message });
    });
});

// Socket.io: manejar conexión y mensajes
io.on('connection', (socket) => {
    console.log('A user connected');

    // Recuperar el nombre de usuario desde la sesión
    socket.on('set username', (name) => {
        socket.request.session.username = name;
        socket.request.session.save();
        console.log(`El usuario se ha conectado con el nombre: ${name}`);
    });

    // Escuchar los mensajes de chat
    socket.on('chat message', (msg) => {
        const username = socket.request.session.username || 'Usuario Desconocido';
        // Guardar el mensaje en la base de datos
        const stmt = db.prepare('INSERT INTO messages (username, message) VALUES (?, ?)');
        stmt.run(username, msg, function (err) {
            if (err) {
                console.error('Error al guardar el mensaje:', err.message);
            } else {
                io.emit('chat message', msg, username); // Emitir el mensaje a todos los clientes
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Iniciar el servidor
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
