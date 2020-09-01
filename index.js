const express = require('express');


class Main {
    constructor(listenPort) {
        this.app = express();
        this.listenPort = listenPort;
        this.setupRoutes();
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.send('hello world');
        });
    }

    run() {
        this.app.listen(this.listenPort, () => console.log(`hello world listening on ${this.listenPort}`));
    }
}

const listenPort = 3000;
const main = new Main(listenPort);
main.run();
