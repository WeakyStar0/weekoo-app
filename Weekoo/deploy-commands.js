require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

console.log('--- SCANNING COMMAND FOLDERS ---');

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    
    // Check if it's a folder or a file
    if (fs.lstatSync(commandsPath).isDirectory()) {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            
            if ('data' in command && 'execute' in command) {
                console.log(`[FOUND] Command: /${command.data.name} (File: ${file})`);
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
            }
        }
    }
}

console.log(`--- TOTAL COMMANDS FOUND: ${commands.length} ---`);

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // ⚠️ Check this: applicationGuildCommands is INSTANT. applicationCommands is GLOBAL (can take 1 hour).
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('--- DEPLOYMENT ERROR ---');
        console.error(error);
    }
})();