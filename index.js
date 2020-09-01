const express = require('express');
const bodyParser = require('body-parser');
const got = require('got');

class TideData {
    constructor() {
        this.rawData = []

        this.downloadData();
    }

    async downloadData() {
        // https://tidesandcurrents.noaa.gov/api-helper/url-generator.html
        // https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20200101&end_date=20200131&station=9410170&product=water_level&datum=MTL&time_zone=gmt&units=english&format=json
        // limited to 31 days max per request

        let startDate = new Date('2020-01-01T00:00:00.000Z');
        let endDate = new Date('2020-12-31T23:59:59.999Z');
        let daysIncrement = 31;

        let reqStartDate = startDate;
        while(reqStartDate < endDate) {

            // compute end date for request
            let reqEndDate = new Date(reqStartDate);
            reqEndDate.setDate(reqStartDate.getDate() + daysIncrement);
            if (reqEndDate > endDate) reqEndDate = endDate;

            console.log(`requesting data for ${reqStartDate} - ${reqEndDate}`);

            let url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20200101&end_date=20200131&station=9410170&product=water_level&datum=MTL&time_zone=gmt&units=english&format=json';
            let request = got(url, {
                responseType: 'json'
            }).then((res) => {
                this.parseData(res.body)
            }).catch((err) => {
                console.log('ERROR: ');
                console.log(err);
            });
            await request; // force synchronous to ensure async requests come back in order

            reqStartDate = reqEndDate;
        }
    }

    parseData(data) {
        // TODO: assuming all data in order already, just append to existing storage

        // expecting format:
        // {
        //     metadata: {
        //         id: '9410170',
        //         name: 'San Diego, San Diego Bay',
        //         lat: '32.7142',
        //         lon: '-117.1736'
        //     },
        //     data: [
        //         {
        //             t: '2020-01-01 00:00',
        //             v: '-0.531',
        //             s: '0.033',
        //             f: '0,0,0,0',
        //             q: 'v'
        //         },
        //         ...
        //     ]
        // }
    }

}

class Main {
    constructor(listenPort) {
        this.listenPort = listenPort;

        this.app = express();
        this.tideData = new TideData();

        this.setupExpress();
        this.setupRoutes();
    }

    setupExpress() {
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(bodyParser.json());
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
