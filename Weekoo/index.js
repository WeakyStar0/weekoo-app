require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios'); 
const { 
    Client, 
    Collection, 
    GatewayIntentBits, 
    Events, 
    MessageFlags, 
    ActivityType, 
    EmbedBuilder, 
    AttachmentBuilder 
} = require('discord.js');

// FIX: Point to 'utils' based on your screenshot
const db = require('./utils/db'); 

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates // Required for Voice Logging
    ] 
});

// --- COMMAND HANDLER ---
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}. Handler is ready!`);
    client.user.setPresence({
        activities: [{ 
            name: 'i like gambling', 
            type: ActivityType.Streaming,
            url: 'https://www.twitch.tv/weekoo_bot' 
        }],
        status: 'online', 
    });
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Allowed Channels Check
        if (interaction.commandName !== 'settings') {
            try {
                const res = await db.query('SELECT allowed_channels FROM guilds WHERE guild_id = $1', [interaction.guild.id]);
                const allowedChannels = res.rows[0]?.allowed_channels || [];
                if (allowedChannels.length > 0 && !allowedChannels.includes(interaction.channel.id)) {
                    return interaction.reply({ content: `🚫 Not allowed here.`, flags: [MessageFlags.Ephemeral] });
                }
            } catch (err) { console.error("DB Check Error:", err); }
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Error!', flags: [MessageFlags.Ephemeral] });
        }
    } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command) try { await command.autocomplete(interaction); } catch (e) { console.error(e); }
    }
});

// --- LOGGING: VOICE ---
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return; 

    // DEBUG LOG
    console.log(`[DEBUG] Voice update detected for ${newState.member.user.tag}`);

    const guildId = newState.guild.id;
    try {
        const res = await db.query('SELECT log_voice_channel FROM guilds WHERE guild_id = $1', [guildId]);
        const logChannelId = res.rows[0]?.log_voice_channel;
        
        if (!logChannelId) {
            console.log(`[DEBUG] No log channel configured for guild ${guildId}`);
            return;
        }

        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) {
            console.log(`[DEBUG] Could not fetch channel ${logChannelId}`);
            return;
        }

        const user = newState.member.user;
        const embed = new EmbedBuilder().setTimestamp().setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() });

        if (!oldState.channelId && newState.channelId) {
            embed.setColor('#00FF00').setTitle('🔊 User Joined Voice').setDescription(`**${user}** joined **<#${newState.channelId}>**`);
        } else if (oldState.channelId && !newState.channelId) {
            embed.setColor('#FF0000').setTitle('🔇 User Left Voice').setDescription(`**${user}** left **<#${oldState.channelId}>**`);
        } else if (oldState.channelId && newState.channelId) {
            embed.setColor('#FFA500').setTitle('🔁 User Moved Voice').setDescription(`**${user}** moved\nFrom: **<#${oldState.channelId}>**\nTo: **<#${newState.channelId}>**`);
        }

        await channel.send({ embeds: [embed] });
        console.log(`[DEBUG] Voice log sent to ${channel.name}`);

    } catch (err) {
        console.error("[DEBUG] Voice Log Error:", err);
    }
});

// --- LOGGING: MESSAGE EDIT ---
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (oldMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return;

    try {
        const res = await db.query('SELECT log_msg_channel FROM guilds WHERE guild_id = $1', [newMsg.guild.id]);
        const logChannelId = res.rows[0]?.log_msg_channel;
        if (!logChannelId) return;

        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#FFFF00')
            .setAuthor({ name: newMsg.author.tag, iconURL: newMsg.author.displayAvatarURL() })
            .setTitle('✏️ Message Edited')
            .setDescription(`**Channel:** <#${newMsg.channel.id}>\n**[Jump](${newMsg.url})**`)
            .addFields(
                { name: 'Old', value: oldMsg.content.slice(0, 1024) || '*(No Text)*' },
                { name: 'New', value: newMsg.content.slice(0, 1024) || '*(No Text)*' }
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) { console.error("[DEBUG] Edit Log Error:", err); }
});

// --- LOGGING: MESSAGE DELETE ---
client.on(Events.MessageDelete, async (message) => {
    if (message.author?.bot) return;

    console.log(`[DEBUG] Message delete detected from ${message.author.tag}`);

    try {
        const res = await db.query('SELECT log_msg_channel FROM guilds WHERE guild_id = $1', [message.guild.id]);
        const logChannelId = res.rows[0]?.log_msg_channel;
        
        if (!logChannelId) {
            console.log("[DEBUG] No message log channel configured.");
            return;
        }

        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setTitle('🗑️ Message Deleted')
            .setDescription(`**Channel:** <#${message.channel.id}>`)
            .addFields({ name: 'Content', value: message.content.slice(0, 1024) || '*(No Text)*' })
            .setTimestamp();

        const files = [];
        let hasImage = false;

        if (message.attachments.size > 0) {
            try {
                const attachment = message.attachments.first();
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data, 'binary');
                const file = new AttachmentBuilder(buffer, { name: 'deleted_evidence.png' });
                files.push(file);
                embed.setImage('attachment://deleted_evidence.png');
                embed.setFooter({ text: '⚠️ Image auto-deletes in 24h' });
                hasImage = true;
            } catch (err) {
                console.error("[DEBUG] Image download failed:", err.message);
                embed.setFooter({ text: 'Failed to recover image.' });
            }
        }

        const logMsg = await channel.send({ embeds: [embed], files: files });

        if (hasImage) {
            await db.query(
                "INSERT INTO temp_logs (guild_id, channel_id, message_id, deletion_time) VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')",
                [message.guild.id, logChannelId, logMsg.id]
            );
        }
        console.log(`[DEBUG] Delete log sent.`);

    } catch (err) {
        console.error("[DEBUG] Delete Log Error:", err);
    }
});

// --- CLEANUP ---
setInterval(async () => {
    try {
        const res = await db.query("SELECT * FROM temp_logs WHERE deletion_time < NOW()");
        for (const row of res.rows) {
            try {
                const channel = await client.channels.fetch(row.channel_id);
                if (channel) {
                    const msg = await channel.messages.fetch(row.message_id);
                    if (msg) await msg.delete();
                }
            } catch (err) {}
            await db.query("DELETE FROM temp_logs WHERE id = $1", [row.id]);
        }
    } catch (err) { console.error('Cleanup Error:', err); }
}, 5 * 60 * 1000);

client.login(process.env.TOKEN);