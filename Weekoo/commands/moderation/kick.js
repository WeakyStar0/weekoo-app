const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a user from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers) // Only mods see this command
        .addUserOption(option => 
            option.setName('target').setDescription('The member to kick').setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('The reason for kicking')),
    async execute(interaction) {
        const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target.kickable) {
            return interaction.reply({ content: '❌ I cannot kick this user (they might have a higher role).', ephemeral: true });
        }

        await target.kick(reason);
        await interaction.reply({ content: `✅ **${target.user.tag}** has been kicked. \n**Reason:** ${reason}` });
    },
};