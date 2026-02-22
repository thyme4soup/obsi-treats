import { TFile } from "obsidian"

interface QueueItem {
    file: TFile,
    visibility: number
}

export class FileQueue {
    queue: QueueItem[];
    
    constructor() {
        this.queue = [];
    }

    push(file: TFile, visibility: number) {
        if (this.queue.find(item => item.file.path === file.path)) {
            console.debug(`File ${file.path} is already in the queue. Skipping...`);
            return;
        }
        this.queue.push({file, visibility});
    }

    getNextUpdate(depth: number = 0): TFile | null {
        let now = Date.now();
        let nextUpdate = this.queue[0];
        if (depth >= this.queue.length) {
            return null;
        } else if (nextUpdate && nextUpdate.visibility < now) {
            return this.queue.splice(depth, 1).shift()!.file;
        } else {
            return this.getNextUpdate(depth + 1);
        }
    }
}