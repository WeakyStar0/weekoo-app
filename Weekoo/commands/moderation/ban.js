const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a user from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(option => 
            option.setName('target').setDescription('The user to ban').setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('The reason for banning')),
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            await interaction.guild.members.ban(target, { reason });
            await interaction.reply({ content: `🔨 **${target.tag}** has been banned. \n**Reason:** ${reason}` });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to ban user. Check my permissions.', ephemeral: true });
        }
    },
};