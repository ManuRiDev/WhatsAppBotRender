const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode-terminal'); // 👈 Para mostrar el QR
const mqtt = require('mqtt');

// Configurá tu broker MQTT
const MQTT_BROKER = "mqtt://broker.emqx.io"; // o tu broker
const MQTT_TOPIC = "SetAgua/01";

const mqttClient = mqtt.connect(MQTT_BROKER);

// Número destino (reemplazalo con el que quieras responder)
const numeroDestino = "50361742544@s.whatsapp.net"; // <-- Tu número o de prueba con formato internacional + @c.us
const grupoDestino = '120363401584074265@g.us'; // <-- Tu número o de prueba con formato internacional + @c.us
                      

mqttClient.on('connect', () => {
  console.log("✅ Conectado a MQTT broker");
  // Suscribirse al topic deseado
  mqttClient.subscribe("GetAgua/01", (err) => {
    if (!err) {
      console.log("🟢 Suscrito al topic GetAgua/01");
    }
  });
});

mqttClient.on('error', (err) => {
  console.error("❌ Error MQTT:", err);
});

// Cuando llega un mensaje desde MQTT
mqttClient.on("message", (topic, message) => {
  console.log("New messae");
  const dato = message.toString();
  const ndato = parseInt(message);
  console.log(`💧 MQTT > ${topic}: ${dato}`);

  try {     
    if(ndato < 0){ 
      sock.sendMessage(grupoDestino,{ text: `🌊 Encendido de forma permanente`} ); 
    }else if(ndato > 0){        
      const minu = parseInt(ndato/60);
      const segun = parseInt(ndato%60);
      sock.sendMessage(grupoDestino,{ text: `🌊 Encendido por ${minu}:minutos y ${segun}:segundos`} ); 
    }else{
      sock.sendMessage(grupoDestino,{ text: `🌊 Apagado`} ); 
    }
  } catch (error) {    
    console.log("grupo no encontrado"); 
    console.log(error); 
  }
});

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // Silencia los logs para mayor claridad
  });

  sock.ev.on('creds.update', saveCreds);

  // Lista de usuarios autorizados
  const permitidos = [
    "50378766494",  //vidal
    "50361742544"   //yo 
  ];

  // Lista de usuarios autorizados
  const PartiPermitidos = [
    "23274494902319"// yo 
  ];

  // Lista de usuarios autorizados
  const NamesPermitidos = [ 
    "Manu",   //yo
    "Orellana"   //ma
  ];

  const IDPermitidos = [ 
    "120363401584074265"  
  ];
  
  // Comandos válidos que el bot reconocerá y enviará al NodeMCU vía MQTT
  const comandos = {
    "on": 1,
    "off": 0
  };

  // ✅ Escuchar mensajes nuevos
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      if (type !== 'notify') return;   

      const mensaje = messages[0];        

      if(mensaje.key.participant === undefined)return;
      if (!mensaje.message) return; 

      const pushName = mensaje.pushName;
      let jidReal = mensaje.key.remoteJid;
      let numeroReal = jidReal.split('@')[0];

      let partReal = mensaje.key.participant;
      let participant = partReal.split('@')[0];

      if(IDPermitidos.includes(numeroReal)){
        if(!NamesPermitidos.includes(pushName) && !PartiPermitidos.includes(participant)){            
          console.log("⛔ Usuario no autorizado:", numeroReal);
          return;
        }
      }else{
        return;
      }        
      console.log(""); 
      //obtenemos el texto del mesaje
      const texto = (mensaje.message?.conversation || mensaje.message?.extendedTextMessage?.text || "").toLowerCase();   
      
      //dividimos el texto un json si es posible      
      const partes = texto.split(','); 

      const sendJson = { accion: parseInt(comandos[partes[0]])} 
      const accion = comandos[partes[0]];       
      
      if (mensaje.key.fromMe) return;

      switch (partes[0]) {
        case 'on':   
          if (partes[1] && parseInt(partes[1])>0) { 
            sendJson.tiempo = parseInt(partes[1]) * 60;   
            await sock.sendMessage(mensaje.key.remoteJid, { text: 'Encendiendo.... '+'Durante ' + partes[1] + ' minutos' });
          }else{            
            sendJson.tiempo = -1; 
            await sock.sendMessage(mensaje.key.remoteJid, { text: 'Encendiendo.... de forma infinita'});
          }                 
          mqttClient.publish(MQTT_TOPIC, JSON.stringify(sendJson)); 
          console.log("📩 Mensaje nuevo de:", pushName,";" , participant, "→", texto," // ", accion, " -- ",sendJson); 
          break;
        case 'off':
          await sock.sendMessage(mensaje.key.remoteJid, { text: 'Apagando....' }); 
          sendJson.tiempo = 0;
          mqttClient.publish(MQTT_TOPIC, JSON.stringify(sendJson));   
          console.log("📩 Mensaje nuevo de:", pushName,";" , participant, "→", texto," // ", accion, " -- ",sendJson); 
          break;  
        case 'status':          
            const sendStaJson = { status: ""}
            mqttClient.publish(MQTT_TOPIC, JSON.stringify(sendStaJson));
            console.log("📩 Mensaje nuevo de:", pushName,";" , participant, "→", texto," // ", accion, " -- ",sendStaJson); 
         break;  
        default:        
          await sock.sendMessage(mensaje.key.remoteJid, { text: 'Comando no valido.-.-.-' });
          break;
      }  
 
    }
    catch (error) { 
    }
  });

  // ✅ Muestra QR y maneja reconexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escaneá este QR para iniciar sesión:");
      qrcode.generate(qr, { small: true }); // 👈 Muestra el QR en consola
    }

    if (connection === 'close') {
      const errorCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = errorCode !== DisconnectReason.loggedOut;
      console.log("🔌 Desconectado. ¿Reconectar?", shouldReconnect);
      if (shouldReconnect) iniciarBot();
    }

    if (connection === 'open') {
      console.log("✅ Bot conectado correctamente a WhatsApp");
    }
  });
}

iniciarBot();
