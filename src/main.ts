import {App, Editor, MarkdownView, Modal, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ObsiTreatSettingsTab, ObsiTreatSettings} from "./settings";
import mqtt, {MqttClient} from "mqtt";

const PROCESSED_TAG = 'treatbot/processed';
const WATCH_TAG = 'treatbot/watch';
const DEFAULT_BOUNTY = 5;
const COMPLETED_TAG = 'closed';
const DEFAULT_STREAK_BONUS = 2;
const BOUNTY_PROPERTY = 'bounty';

export default class ObsiTreats extends Plugin {
	settings: ObsiTreatSettings;
	mqttClient: MqttClient;

	async onload() {
		this.mqttClient = mqtt.connect('mqtt://mqtt-ws.souphub.io:80');
		this.mqttClient.on('connect', () => {
			console.debug('Connected to MQTT broker');
		});

		await this.loadSettings();

		// Periodically check the dailies for habit streaks
		this.registerInterval(window.setInterval(() => {
			console.debug('setInterval')
		}, 5 * 60 * 1000));

		// Listen for file changes such as closing tasks
		this.app.vault.on('modify', async (file) => {
			await this.checkForTaskUpdate(file);
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ObsiTreatSettingsTab(this.app, this));
	}

	// Idempotent function to check if a task has been completed and award points accordingly
	async checkForTaskUpdate(abstractFile: TAbstractFile) {
		// Get the file properties
		if (!(abstractFile instanceof TFile) || abstractFile.extension !== 'md') {
			return;
		}
		await this.app.fileManager.processFrontMatter(abstractFile, (frontMatter) => {
			if (!frontMatter || typeof frontMatter !== 'object') {
				return;
			}
			if (typeof frontMatter['tags'] !== 'object' || !Array.isArray(frontMatter['tags'])) {
				console.warn(`File ${abstractFile.path} tags are not in expected format. Skipping...`);
				return;
			}
			let tags: string[] = frontMatter['tags'];
			// Check if the file has a "task" property
			if (tags && tags.includes('task') && tags.includes(WATCH_TAG)) {
				// If it does, check if the task is marked as completed
				if (tags.includes(COMPLETED_TAG) && !tags.includes(PROCESSED_TAG)) {
					// add the "processed" tag to prevent duplicate processing
					tags.push(PROCESSED_TAG);
					frontMatter['tags'] = tags;
					// emit the event
					let bounty = frontMatter[BOUNTY_PROPERTY] || DEFAULT_BOUNTY;
					console.debug(`Task completed! Awarding ${bounty} points.`);
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ObsiTreatSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
