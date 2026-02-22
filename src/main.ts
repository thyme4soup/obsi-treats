import {App, Editor, MarkdownView, Modal, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, ObsiTreatSettings} from "./settings";
import mqtt, {MqttClient} from "mqtt";

const PROCESSED_TAG = 'treatbot/processed';
const WATCH_TAG = 'treatbot/watch';
const DEFAULT_BOUNTY = 5;
const COMPLETED_TAG = 'closed';
const DEFAULT_STREAK_BONUS = 2;
const BOUNTY_PROPERTY = 'bounty';

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	mqttClient: MqttClient;

	async onload() {
		this.mqttClient = mqtt.connect('mqtt://mqtt-ws.souphub.io:80');
		this.mqttClient.on('connect', () => {
			console.log('Connected to MQTT broker');
		});

		await this.loadSettings();

		// Periodically check the dailies for habit streaks
		this.registerInterval(window.setInterval(() => {
			console.log('setInterval')
		}, 5 * 60 * 1000));

		// Listen for file changes such as closing tasks
		this.app.vault.on('modify', (file) => {
			this.checkForTaskUpdate(file);
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsiTreatSettings(this.app, this));
	}

	async checkForTaskUpdate(file: TAbstractFile) {
		// Get the file properties
		this.app.fileManager.processFrontMatter(file as TFile, (frontMatter) => {
			let tags = frontMatter['tags'];
			// Check if the file has a "task" property
			if (tags && tags.includes('task') && tags.includes(WATCH_TAG)) {
				// If it does, check if the task is marked as completed
				if (tags.includes(COMPLETED_TAG) && !tags.includes(PROCESSED_TAG)) {
					// add the "processed" tag to prevent duplicate processing
					tags.push(PROCESSED_TAG);
					frontMatter['tags'] = tags;
					// emit the event
					let bounty = frontMatter[BOUNTY_PROPERTY] || DEFAULT_BOUNTY;
					console.log(`Task completed! Awarding ${bounty} points.`);
					this.mqttClient.publish('/treatbot/soup', `${bounty}`);
				}
			}
		});
	}

	onunload() {
		if (this.mqttClient) {
			this.mqttClient.end();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
