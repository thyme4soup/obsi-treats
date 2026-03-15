import {App, PluginSettingTab, Setting} from "obsidian";
import ObsiTreats from "./main";

export interface ObsiTreatSettings {
	user: string;
	dailyFolder: string;
	inlineTreatValue: number;
	treatServerUrl: string;
}

export const DEFAULT_SETTINGS: ObsiTreatSettings = {
	treatServerUrl: 'https://your-treat-server-url/',
	user: 'default-user',
	dailyFolder: 'Daily',
	inlineTreatValue: 1,
}

export class ObsiTreatSettingsTab extends PluginSettingTab {
	plugin: ObsiTreats;

	constructor(app: App, plugin: ObsiTreats) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Treat Server URL')
			.setDesc('The base URL for your treat server (e.g., https://your-treat-server.com/)')
			.addText(text => text
				.setPlaceholder('Enter your treat server URL')
				.setValue(this.plugin.settings.treatServerUrl)
				.onChange(async (value) => {
					this.plugin.settings.treatServerUrl = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('User Name')
			.setDesc('The user you set for your treatbot')
			.addText(text => text
				.setPlaceholder('Enter your user name')
				.setValue(this.plugin.settings.user)
				.onChange(async (value) => {
					this.plugin.settings.user = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Daily Folder')
			.setDesc('The folder where your daily notes are stored')
			.addText(text => text
				.setPlaceholder('Enter your daily folder name')
				.setValue(this.plugin.settings.dailyFolder)
				.onChange(async (value) => {
					this.plugin.settings.dailyFolder = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Inline Treat Value')
			.setDesc('The value of an inline treat')
			.addText(text => text
				.setPlaceholder('Enter your inline treat value')
				.setValue(this.plugin.settings.inlineTreatValue.toString())
				.onChange(async (value) => {
					this.plugin.settings.inlineTreatValue = parseInt(value);
					await this.plugin.saveSettings();
				}));
	}
}
