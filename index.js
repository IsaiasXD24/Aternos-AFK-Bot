 res.send('Bot is running and kept alive by Uptime Robot.');
});

app.listen(port, () => {
  console.log(`Web server started and listening on port ${port}`);
});

// ------------------------------------------------------------------
// LÓGICA PRINCIPAL DEL BOT AFK
// ------------------------------------------------------------------

const mineflayer = require('mineflayer');
const settings = require('./settings.json');

const botOptions = {
    host: settings.server.ip,
    port: settings.server.port,
    username: settings.bot.username,
    password: settings.bot.password,
    version: settings.server.version,
    auth: settings.bot.type,
    // La opción de reconexión ahora se gestiona en 'utils'
};

function createBot() {
    const bot = mineflayer.createBot(botOptions);
    console.log(`[AfkBot] Trying to connect to ${settings.server.ip}:${settings.server.port} with account: ${settings.bot.username} (${settings.bot.type})`);

    // --- EVENTOS DEL BOT ---

    bot.on('login', () => {
        console.log(`[AfkBot] Bot joined the server!`);
        // Desactivamos el movimiento inicial si la posición está deshabilitada
        if (settings.position.enabled) {
            bot.setControlState('forward', true);
            bot.look(settings.position.x, settings.position.y, settings.position.z, false, () => {
                console.log(`[AfkBot] Moving to initial position.`);
            });
        }
    });

    bot.on('end', (reason) => {
        console.log(`[AfkBot] Disconnected. Reason: ${reason}`);

        if (settings.utils.auto_reconnect) {
            console.log(`[AfkBot] Reconnecting in ${settings.utils.auto_recconect_delay / 1000} seconds...`);
            setTimeout(createBot, settings.utils.auto_recconect_delay);
        }
    });

    bot.on('kicked', (reason) => {
        console.log(`[AfkBot] Kicked from server. Reason: ${reason}`);
    });

    bot.on('error', (err) => {
        console.error(`[ERROR] ${err}`);
    });

    // --- MÓDULOS DEL BOT ---

    // Anti-AFK
    if (settings.utils['anti-afk'].enabled) {
        console.log('[INFO] Started anti-afk module');
        setInterval(() => {
            if (bot.getControlState('sneak') !== settings.utils['anti-afk'].sneak) {
                bot.setControlState('sneak', settings.utils['anti-afk'].sneak);
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            }
        }, 10000); // Cada 10 segundos
    }

    // Chat Messages
    if (settings.utils['chat-messages'].enabled && settings.utils['chat-messages'].messages.length > 0) {
        let messageIndex = 0;
        console.log('[INFO] Started chat-messages module');
        
        const sendNextMessage = () => {
            if (bot.getControlState('forward')) { // Solo envía si está "activo"
                const message = settings.utils['chat-messages'].messages[messageIndex];
                bot.chat(message);
                
                messageIndex = (messageIndex + 1) % settings.utils['chat-messages'].messages.length;

                if (settings.utils['chat-messages'].repeat) {
                    setTimeout(sendNextMessage, settings.utils['chat-messages']['repeat-delay'] * 1000); // segundos a milisegundos
                }
            } else {
                // Si el bot no está en el juego, intenta de nuevo después de 30 segundos
                setTimeout(sendNextMessage, 30000);
            }
        };

        // Inicia el ciclo de mensajes solo después de un tiempo para no saturar al inicio
        setTimeout(sendNextMessage, settings.utils['chat-messages']['repeat-delay'] * 1000);
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
