const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');
const os = require('node:os');
const db = require('../../utils/db'); // Path based on your folder config

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botstats')
        .setDescription('View technical information about Weekoo, the System, and the Database.'),

    async execute(interaction) {
        // Acknowledge immediately as DB queries can take a moment
        await interaction.deferReply();

        // 1. CALCULATE UPTIME
        const totalSeconds = (interaction.client.uptime / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor(totalSeconds / 3600) % 24;
        const minutes = Math.floor(totalSeconds / 60) % 60;
        const seconds = Math.floor(totalSeconds % 60);
        const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        // 2. MEMORY & CPU
        const usage = process.memoryUsage();
        const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
        const toGB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(2);
        const cpus = os.cpus();
        const loadAvg = os.loadavg().map(l => l.toFixed(2)).join(', ');

        // 3. LATENCY (Bot & API)
        const apiPing = Math.round(interaction.client.ws.ping);
        const botPing = Date.now() - interaction.createdTimestamp;

        // 4. DATABASE STATS & LATENCY
        const dbStartTime = Date.now();
        let dbStats = { version: 'Unknown', userCount: 0, itemCount: 0, size: '0 MB' };
        
        try {
            const res = await db.query(`
                SELECT 
                    version(),
                    (SELECT count(*) FROM users) as user_count,
                    (SELECT count(*) FROM items) as item_count,
                    pg_size_pretty(pg_database_size(current_database())) as db_size
            `);
            const data = res.rows[0];
            dbStats = {
                version: data.version.split(' ')[1], // Gets just the version number
                userCount: data.user_count,
                itemCount: data.item_count,
                size: data.db_size
            };
        } catch (err) {
            console.error("DB Stats Error:", err);
        }
        const dbLatency = Date.now() - dbStartTime;

        // 5. BUILD THE EMBED
        const embed = new EmbedBuilder()
            .setColor('#7300ff')
            .setTitle('📊 Weekoo Advanced Technical Dashboard')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .addFields(
                // --- IDENTITY ---
                { name: '🤖 Bot Info', value: 
                    `**Tag:** ${interaction.client.user.tag}\n` +
                    `**Guilds:** ${interaction.client.guilds.cache.size}\n` +
                    `**Uptime:** \`${uptimeString}\``, inline: true 
                },

                // --- CONNECTION ---
                { name: '🌐 Latency', value: 
                    `**API:** \`${apiPing}ms\`\n` +
                    `**Bot:** \`${botPing}ms\`\n` +
                    `**DB:** \`${dbLatency}ms\``, inline: true 
                },

                // --- DATABASE ---
                { name: '🗄️ Database (NeonDB)', value: 
                    `**Engine:** \`PostgreSQL ${dbStats.version}\`\n` +
                    `**Total Size:** \`${dbStats.size}\`\n` +
                    `**Users Reg:** \`${dbStats.userCount}\` souls\n` +
                    `**Items Reg:** \`${dbStats.itemCount}\` objects`, inline: true 
                },

                // --- HARDWARE ---
                { name: '🖥️ Hardware & OS', value: 
                    `**OS:** \`${os.type()} ${os.arch()}\`\n` +
                    `**CPU:** \`${cpus[0].model}\` (${cpus.length} cores)\n` +
                    `**Load:** \`${loadAvg}\``, inline: false 
                },

                // --- MEMORY ---
                { name: '💾 Memory Usage', value: 
                    `**Process:** \`${toMB(usage.heapUsed)} MB\` used\n` +
                    `**RSS:** \`${toMB(usage.rss)} MB\` total\n` +
                    `**System Free:** \`${toGB(os.freemem())} GB\``, inline: true 
                },

                // --- RUNTIME ---
                { name: '⚙️ Runtime Environment', value: 
                    `**Node.js:** \`${process.version}\`\n` +
                    `**Discord.js:** \`v${djsVersion}\`\n` +
                    `**Hostname:** \`${os.hostname()}\``, inline: true 
                }
            )
            .setFooter({ text: 'Performance data provided by Weekoo Kernel' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};