import {App, PluginSettingTab, Setting} from "obsidian";
import ObsiTreats from "./main";

export interface ObsiTreatSettings {
	mqttBroker: string;
	mqttUser: string;
	mqttPassword: string;
	user: string;
	dailyFolder: string;
}

export const DEFAULT_SETTINGS: ObsiTreatSettings = {
	mqttBroker: 'mqtt://your-broker-here:1883',
	mqttUser: 'default-user',
	mqttPassword: 'default-password',
	user: 'default-user',
	dailyFolder: 'Daily'
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
			.setName('Broker URL for MQTT service')
			.setDesc('The URL of your MQTT broker (e.g., mqtt://localhost:1883)')
			.addText(text => text
				.setPlaceholder('Enter your MQTT broker URL')
				.setValue(this.plugin.settings.mqttBroker)
				.onChange(async (value) => {
					this.plugin.settings.mqttBroker = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('User Name for MQTT service')
			.setDesc('The user name for your MQTT broker')
			.addText(text => text
				.setPlaceholder('Enter your MQTT user name')
				.setValue(this.plugin.settings.mqttUser)
				.onChange(async (value) => {
					this.plugin.settings.mqttUser = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('MQTT Password')
			.setDesc('The password for your MQTT broker')
			.addText(text => text
				.setPlaceholder('Enter your MQTT password')
				.setValue(this.plugin.settings.mqttPassword)
				.onChange(async (value) => {
					this.plugin.settings.mqttPassword = value;
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
	}
}
