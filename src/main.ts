import {Notice, Plugin, TAbstractFile, TFile, requestUrl} from 'obsidian';
import {DEFAULT_SETTINGS, ObsiTreatSettingsTab, ObsiTreatSettings} from "./settings";
import { FileQueue } from 'file-queue';

const PROCESSED_TAG = 'treatbot/cleared';
const WATCH_TAG = 'treatbot/watch';
const COMPLETED_TAG = 'closed';
const BOUNTY_PROPERTY = 'bounty';


export default class ObsiTreats extends Plugin {
	settings: ObsiTreatSettings;
	fileQueue: FileQueue = new FileQueue();
	async onload() {
		await this.loadSettings();

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
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			try {
				await this.checkForTaskUpdate(file);
			} catch (error) {
				console.error('Error handling file modification:', error);
			}
		}));
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
						console.debug(`Frontmatter ${JSON.stringify(frontMatter)} tags are not in expected format. Skipping...`);
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

					// Post the reward update to the HTTP server.
					console.debug(`Daily task completed! Awarding ${this.settings.inlineTreatValue} points.`);
					await this.postReward(this.settings.inlineTreatValue);
				}
			}

			if (updated) {
				await this.app.vault.modify(abstractFile, lines.join(eol));
			}
		}
		else {
			// Handle task file
			let rewardPoints: number | null = null;
			await this.app.fileManager.processFrontMatter(abstractFile, (frontMatter) => {
				if (!frontMatter || typeof frontMatter !== 'object') {
					console.debug(`File ${abstractFile.path} has no frontmatter or frontmatter is not an object. Skipping...`);
					return;
				}
				if (typeof frontMatter['tags'] !== 'object' || !Array.isArray(frontMatter['tags'])) {
					console.debug(`File ${abstractFile.path} tags are not in expected format ${JSON.stringify(frontMatter['tags'])}. Skipping...`);
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
						const bountyCandidate = Number(frontMatter[BOUNTY_PROPERTY]);
						const bounty = Number.isFinite(bountyCandidate) && bountyCandidate > 0
							? bountyCandidate
							: this.settings.inlineTreatValue;
						console.debug(`Task completed! Awarding ${bounty} points.`);
						rewardPoints = bounty;
					}
				}
			});

			if (rewardPoints !== null) {
				await this.postReward(rewardPoints);
			}
		}
	}

	async postReward(points: number) {
		const baseUrl = this.settings.treatServerUrl?.trim();
		if (!baseUrl) {
			console.error('Treat server URL is not configured.');
			new Notice('Treat server URL is not configured.');
			return false;
		}

		const rewardUser = this.settings.user?.trim();
		if (!rewardUser) {
			console.error('Treat user is not configured.');
			new Notice('Treat user is not configured.');
			return false;
		}

		const encodedUser = encodeURIComponent(rewardUser);
		const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
		const endpoint = /\/v1\/[^/]+\/modify$/i.test(normalizedBaseUrl)
			? normalizedBaseUrl.replace(/\/v1\/[^/]+\/modify$/i, `/v1/${encodedUser}/modify`)
			: `${normalizedBaseUrl}/v1/${encodedUser}/modify`;

		try {
			const response = await requestUrl({
				url: endpoint,
				method: 'POST',
				contentType: 'application/json',
				body: JSON.stringify({
					delta: points,
					user: this.settings.user,
				}),
				throw: false,
			});

			if (response.status < 200 || response.status >= 300) {
				console.error(`Failed to post reward (${response.status}): ${response.text}`);
				new Notice(`Failed to post reward (${response.status}).`);
				return false;
			}

			console.debug(`Reward posted successfully: ${points} points`);
			return true;
		} catch (error) {
			console.error('Failed to post reward:', error);
			new Notice('Failed to post reward. Check console for details.');
			return false;
		}
	}

	onunload() {
		// No persistent network client to close.
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ObsiTreatSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
