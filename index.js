// Importaciones del servidor web y del bot
const express = require('express');
const app = express();
const mineflayer = require('mineflayer');
const settings = require('./settings.json'); // Mantenemos la carga para la lógica de utilidades (AFK, Chat)

// --- 1. CONFIGURACIÓN DEL SERVIDOR WEB ---
// Render usa la variable PORT. Si no existe, usamos 3000 por defecto.
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running and kept alive by Uptime Robot.');
});

app.listen(port, () => { // <-- Servidor escuchando el puerto de Render
  console.log(`[WebServer] Server started and listening on port ${port}.`);
});

// ------------------------------------------------------------------
// --- 2. CARGA DE VARIABLES DE ENTORNO (SECRETS) ---
// Usamos las Variables de Entorno de Render como prioridad. 
// Si la variable de entorno no existe (por ejemplo, en pruebas locales), usamos el valor de settings.json como fallback.

const BOT_USERNAME = process.env.BOT_USERNAME || settings["bot-account"].username;
const BOT_PASSWORD = process.env.BOT_PASSWORD || settings["bot-account"].password;
const BOT_HOST = process.env.BOT_HOST || settings.server.ip;
// Usamos BOT_PORT_MC para el puerto de Minecraft y evitamos el conflicto con el puerto del webserver (process.env.PORT)
const BOT_PORT_MC = process.env.BOT_PORT_MC ? parseInt(process.env.BOT_PORT_MC) : settings.server.port;

const botOptions = {
    // Usamos las variables de entorno para las credenciales:
    host: BOT_HOST,
    port: BOT_PORT_MC, 
    username: BOT_USERNAME,
    password: BOT_PASSWORD,
    // Usamos settings.json para los valores que no son secretos:
    version: settings.server.version,
    auth: settings["bot-account"].type,
};

// ------------------------------------------------------------------
// LÓGICA PRINCIPAL DEL BOT AFK
// ------------------------------------------------------------------

function createBot() {
    // Verificación de seguridad
    if (!botOptions.username || !botOptions.host) {
        console.error("❌ ERROR CRÍTICO: Las credenciales (BOT_USERNAME, BOT_HOST) no están configuradas en Render. Saliendo del proceso.");
        process.exit(1);
    }
    
    const bot = mineflayer.createBot(botOptions);
    console.log(`[AfkBot] Trying to connect to ${botOptions.host}:${botOptions.port} with account: ${botOptions.username} (${botOptions.auth})`);

    // --- EVENTOS DEL BOT ---

    bot.on('login', () => {
        console.log(`[AfkBot] Bot joined the server!`);
        // Desactivamos el movimiento inicial si la posición está deshabilitada
        if (settings.position.enabled) {
            // Nota: El comando look original podría estar fallando. Mantenemos el setControlState para asegurar el movimiento.
            bot.setControlState('forward', true);
            console.log(`[AfkBot] Initial forward movement started.`);
        }
    });

    bot.on('end', (reason) => {
        console.log(`[AfkBot] Disconnected. Reason: ${reason}`);

        // Nota: El archivo settings.json usa 'auto-reconnect' y 'auto-recconect-delay' (con 3 c's).
        if (settings.utils['auto-reconnect']) {
            const reconnectDelay = settings.utils['auto-recconect-delay'] || 15000;
            console.log(`[AfkBot] Reconnecting in ${reconnectDelay / 1000} seconds...`);
            setTimeout(createBot, reconnectDelay);
        } else {
            // Si el auto-reconnect está deshabilitado, forzamos la salida para que Render reinicie el servicio.
             console.log('[AfkBot] Auto-reconnect disabled. Forcing process exit for Render.');
             process.exit(1);
        }
    });

    bot.on('kicked', (reason) => {
        console.log(`[AfkBot] Kicked from server. Reason: ${reason}`);
        bot.end(); // Fuerza el evento 'end' para que se active el auto-reconnect
    });

    bot.on('error', (err) => {
        console.error(`[ERROR] ${err}`);
        bot.end(); // Fuerza el evento 'end' para que se active el auto-reconnect
    });

    // --- MÓDULOS DEL BOT ---
    // Anti-AFK con Movimiento Aleatorio
    if (settings.utils['anti-afk'] && settings.utils['anti-afk'].enabled) {
        console.log('[INFO] Started anti-afk module with random movement.');

        // Lista de controles de movimiento de Minecraft
        const movements = ['forward', 'back', 'left', 'right'];
        let currentMovement = 'forward'; // Movimiento inicial por defecto

        // Intervalo para el movimiento aleatorio y acciones AFK
        // Usamos el nuevo 'movement_delay' de settings.json (o 2000ms por defecto)
        const moveDelay = settings.utils['anti-afk']['movement_delay'] || 2000;

        setInterval(() => {
            // Seguridad: VERIFICAR si el bot está activo (tiene una entidad) antes de intentar moverlo.
            if (!bot.entity) {
                return;
            }
            
            // 1. Lógica de Salto (Jump) y Agacharse (Sneak)
            const shouldSneak = settings.utils['anti-afk'].sneak;
            
            if (bot.getControlState('sneak') !== shouldSneak) {
                bot.setControlState('sneak', shouldSneak);
            }
            
            // Salto: hacemos que salte por un momento
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);


            // 2. Lógica de Movimiento Aleatorio (W, A, S, D)
            
            // a) Desactivar el movimiento actual
            bot.setControlState(currentMovement, false); 
            
            // b) Elegir un nuevo movimiento aleatorio de la lista
            const newMovementIndex = Math.floor(Math.random() * movements.length);
            const newMovement = movements[newMovementIndex];
            
            // c) Activar el nuevo movimiento
            bot.setControlState(newMovement, true);
            currentMovement = newMovement; // Guardamos el nuevo movimiento como el actual

        }, moveDelay); 
    }

    // Chat Messages
    if (settings.utils['chat-messages'] && settings.utils['chat-messages'].enabled && settings.utils['chat-messages'].messages.length > 0) {
        let messageIndex = 0;
        console.log('[INFO] Started chat-messages module');
        
        const sendNextMessage = () => {
            // Solo enviar si el bot está conectado y ha cargado la entidad
            if (bot.entity && settings.utils['chat-messages'].repeat) {
                const message = settings.utils['chat-messages'].messages[messageIndex];
                bot.chat(message);
                
                messageIndex = (messageIndex + 1) % settings.utils['chat-messages'].messages.length;

                const delay = settings.utils['chat-messages']['repeat-delay'] || 120; // Default 120 secs
                setTimeout(sendNextMessage, delay * 1000); 
            } else if (settings.utils['chat-messages'].repeat) {
                // Si no está conectado, intenta de nuevo después de 30 segundos
                setTimeout(sendNextMessage, 30000);
            }
        };

        // Inicia el ciclo de mensajes después del primer retraso
        const initialDelay = settings.utils['chat-messages']['repeat-delay'] || 120;
        setTimeout(sendNextMessage, initialDelay * 1000);
    }

    // Chat Log
    if (settings.utils['chat-log']) {
        bot.on('message', (message) => {
            console.log(`[CHAT] ${message.toAnsi()}`);
        });
    }
}

// Inicializa el bot
createBot();
