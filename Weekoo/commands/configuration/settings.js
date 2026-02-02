const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage Weekoo settings for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admins Only
        
        // --- GROUP 1: CHANNELS ---
        .addSubcommandGroup(group =>
            group.setName('channels')
                .setDescription('Manage where Weekoo is allowed to speak.')
                .addSubcommand(sub =>
                    sub.setName('add')
                        .setDescription('Allow Weekoo to use a specific channel.')
                        .addChannelOption(opt => opt.setName('channel').setDescription('The channel to add').setRequired(true)))
                .addSubcommand(sub =>
                    sub.setName('remove')
                        .setDescription('Stop Weekoo from using a specific channel.')
                        .addChannelOption(opt => opt.setName('channel').setDescription('The channel to remove').setRequired(true)))
                .addSubcommand(sub =>
                    sub.setName('list')
                        .setDescription('View the list of allowed channels.'))
        )

        // --- GROUP 2: LOGGING ---
        .addSubcommandGroup(group =>
            group.setName('logging')
                .setDescription('Configure logging systems.')
                .addSubcommand(sub =>
                    sub.setName('voice')
                        .setDescription('Set the channel for Voice logs.')
                        .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true)))
                .addSubcommand(sub =>
                    sub.setName('messages')
                        .setDescription('Set the channel for Message logs.')
                        .addChannelOption(opt => opt.setName('channel').setDescription('The channel').setRequired(true)))
                .addSubcommand(sub =>
                    sub.setName('disable')
                        .setDescription('Disable a logging module.')
                        .addStringOption(opt => 
                            opt.setName('type')
                                .setDescription('Which log to disable?')
                                .setRequired(true)
                                .addChoices({ name: 'Voice', value: 'voice' }, { name: 'Messages', value: 'msg' })))
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        // Ensure guild exists in DB
        await db.query('INSERT INTO guilds (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING', [guildId]);

        // --- HANDLE CHANNELS ---
        if (group === 'channels') {
            if (subcommand === 'add') {
                const channel = interaction.options.getChannel('channel');
                const res = await db.query(
                    `UPDATE guilds 
                     SET allowed_channels = array_append(allowed_channels, $1) 
                     WHERE guild_id = $2 AND NOT ($1 = ANY(allowed_channels))
                     RETURNING *`,
                    [channel.id, guildId]
                );

                if (res.rowCount === 0) {
                    return interaction.reply({ content: `❌ <#${channel.id}> is already in the allowed list!`, flags: [MessageFlags.Ephemeral] });
                }
                return interaction.reply(`✅ Added <#${channel.id}> to allowed channels.`);
            }

            if (subcommand === 'remove') {
                const channel = interaction.options.getChannel('channel');
                const res = await db.query(
                    `UPDATE guilds 
                     SET allowed_channels = array_remove(allowed_channels, $1) 
                     WHERE guild_id = $2 AND ($1 = ANY(allowed_channels))
                     RETURNING *`,
                    [channel.id, guildId]
                );

                if (res.rowCount === 0) {
                    return interaction.reply({ content: `❌ <#${channel.id}> wasn't in the list anyway.`, flags: [MessageFlags.Ephemeral] });
                }
                return interaction.reply(`🗑️ Removed <#${channel.id}> from allowed channels.`);
            }

            if (subcommand === 'list') {
                const res = await db.query('SELECT allowed_channels FROM guilds WHERE guild_id = $1', [guildId]);
                const channels = res.rows[0]?.allowed_channels || [];

                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('📢 Allowed Channels')
                    .setDescription(channels.length > 0 
                        ? channels.map(id => `• <#${id}>`).join('\n') 
                        : 'Weekoo is currently allowed in **ALL** channels.')
                    .setFooter({ text: 'Use /settings channels add/remove to change this.' });

                return interaction.reply({ embeds: [embed] });
            }
        }

        // --- HANDLE LOGGING ---
        if (group === 'logging') {
            if (subcommand === 'voice') {
                const channel = interaction.options.getChannel('channel');
                await db.query('UPDATE guilds SET log_voice_channel = $1 WHERE guild_id = $2', [channel.id, guildId]);
                return interaction.reply(`🎙️ Voice logs will now be sent to ${channel}.`);
            }

            if (subcommand === 'messages') {
                const channel = interaction.options.getChannel('channel');
                await db.query('UPDATE guilds SET log_msg_channel = $1 WHERE guild_id = $2', [channel.id, guildId]);
                return interaction.reply(`📝 Message logs will now be sent to ${channel}.`);
            }

            if (subcommand === 'disable') {
                const type = interaction.options.getString('type');
                if (type === 'voice') {
                    await db.query('UPDATE guilds SET log_voice_channel = NULL WHERE guild_id = $1', [guildId]);
                    return interaction.reply('🎙️ Voice logging disabled.');
                } else {
                    await db.query('UPDATE guilds SET log_msg_channel = NULL WHERE guild_id = $1', [guildId]);
                    return interaction.reply('📝 Message logging disabled.');
                }
            }
        }
    },
};