import {App, Editor, MarkdownView, Modal, Notice, Plugin, TAbstractFile, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, ObsiTreatSettingsTab, ObsiTreatSettings} from "./settings";
import mqtt, {MqttClient} from "mqtt";
import { FileQueue } from 'file-queue';
import AsyncLock from 'async-lock';

const PROCESSED_TAG = 'treatbot/cleared';
const WATCH_TAG = 'treatbot/watch';
const DEFAULT_TASK_BOUNTY = 5;
const DEFAULT_DAILY_BOUNTY = 1;
const DEFAULT_STREAK_BONUS = 2;
const COMPLETED_TAG = 'closed';
const BOUNTY_PROPERTY = 'bounty';


export default class ObsiTreats extends Plugin {
	settings: ObsiTreatSettings;
	mqttClient: MqttClient;
	fileQueue: FileQueue = new FileQueue();
	asyncLock: AsyncLock = new AsyncLock();
	async onload() {
		await this.loadSettings();
		this.mqttClient = mqtt.connect(this.settings.mqttBroker);
		this.mqttClient.on('connect', () => {
			console.debug('Connected to MQTT broker');
		});

		// Periodically add files to the check queue
		this.registerInterval(window.setInterval(async () => {
			try {
				await this.populateCheckQueue();
			} catch (error) {
				console.error('Error populating check queue:', error);
			}
		}, 30 * 1000));

		// Periodically check a file from the queue
		this.registerInterval(window.setInterval(async () => {
			try {
				await this.checkQueue();
			} catch (error) {
				console.error('Error checking queue:', error);
			}
		}, 3 * 1000));

		// Listen for file changes such as closing tasks
		this.app.vault.on('modify', async (file) => {
			try {
				await this.checkForTaskUpdate(file);
			} catch (error) {
				console.error('Error handling file modification:', error);
			}
		});
		this.addSettingTab(new ObsiTreatSettingsTab(this.app, this));
	}

	async checkQueue() {
		let nextFile = this.fileQueue.getNextUpdate();
		if (!nextFile) {
			return;
		}
		await this.checkForTaskUpdate(nextFile);
	}

	async populateCheckQueue() {
		this.app.vault.getMarkdownFiles().forEach(async (file) => {
			await this.app.fileManager.processFrontMatter(file, (frontMatter) => {
				if (file.path.includes(this.settings.dailyFolder)) {
					this.fileQueue.push(file, Date.now());
				} else {
					// check if task
					if (!frontMatter || typeof frontMatter !== 'object') {
						return;
					}
					else if (typeof frontMatter['tags'] !== 'object' || !Array.isArray(frontMatter['tags'])) {
						console.debug(`Frontmatter ${frontMatter} tags are not in expected format. Skipping...`);
						return;
					}
					let tags: string[] = frontMatter['tags'];
					if (tags.includes('task') && tags.includes(WATCH_TAG) && !tags.includes(PROCESSED_TAG)) {
						this.fileQueue.push(file, Date.now());
					}
				}
			});
		});
	}

	// Idempotent function to check if a task has been completed and award points accordingly
	async checkForTaskUpdate(abstractFile: TAbstractFile) {
		// Get the file properties
		if (!(abstractFile instanceof TFile) || abstractFile.extension !== 'md') {
			return;
		}
		this.asyncLock.acquire(abstractFile.path, async () => {
			console.debug(`Checking file ${abstractFile.path} for updates...`);
			if (abstractFile.path.includes(this.settings.dailyFolder)) {
				// Handle daily file
				const contents = await this.app.vault.read(abstractFile);
				const eol = contents.includes('\r\n') ? '\r\n' : '\n';
				const lines = contents.split(/\r?\n/);
				let updated = false;

				for (let i = 0; i < lines.length; i++) {
					const originalLine = lines[i] ?? '';
					const trimmedLine = originalLine.trim();
					if (trimmedLine.startsWith('- [x]') && trimmedLine.includes(`#${WATCH_TAG}`) && !trimmedLine.includes(`#${PROCESSED_TAG}`)) {
						console.debug(`Found completed daily task in ${abstractFile.path}: ${trimmedLine}`);
						lines[i] = `${originalLine} #${PROCESSED_TAG}`;
						updated = true;

						// TODO: Detect streaks (same daily done yesterday)

						// Emit the event to MQTT
						console.debug(`Daily task completed! Awarding ${DEFAULT_DAILY_BOUNTY} points.`);
						this.mqttClient.publish(`/treatbot/${this.settings.user}`, `${DEFAULT_DAILY_BOUNTY}`);
					}
				}

				if (updated) {
					await this.app.vault.modify(abstractFile, lines.join(eol));
				}
			}
			else {
				// Handle task file
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
							let bounty = frontMatter[BOUNTY_PROPERTY] || DEFAULT_TASK_BOUNTY;
							console.debug(`Task completed! Awarding ${bounty} points.`);
							this.mqttClient.publish(`/treatbot/${this.settings.user}`, `${bounty}`);
						}
					}
				});
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
