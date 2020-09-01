const express = require('express');
const bodyParser = require('body-parser');
const got = require('got');

class TideData {
    // NOAA water level product has 6 minute intervals, so structure local data storage to match that
    // use an array where each index is a new 6 minute interval
    // starting offset of 0 would be Jan 1 2020 00:00:00Z

    constructor() {
        this.rawData = [];

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

            console.log(`requesting data for ${reqStartDate.toISOString()} - ${reqEndDate.toISOString()}`);

            // super hacky because JS Date isn't great, grab first 10 chars of ISO format
            let apiBeginDate = `${reqStartDate.toISOString().slice(0,4)}${reqStartDate.toISOString().slice(5,7)}${reqStartDate.toISOString().slice(8,10)}`
            let apiEndDate = `${reqEndDate.toISOString().slice(0,4)}${reqEndDate.toISOString().slice(5,7)}${reqEndDate.toISOString().slice(8,10)}`

            let url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${apiBeginDate}&end_date=${apiEndDate}&station=9410170&product=water_level&datum=MTL&time_zone=gmt&units=english&format=json`;
            console.log(url);
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
            reqStartDate.setDate(reqStartDate.getDate() + 1); // increment one day so we dont include the same day again
        }
    }

    parseData(payload) {
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

        this.rawData = this.rawData.concat(payload.data);
        console.log(`current rawData size: ${this.rawData.length}`);
    }

    getEntry(time) {
        return this.rawData[this.getIndexFromTime(time)];
    }

    getIndexFromTime(time) {
        // get the index given a time
        // round the given time down to previous 6 minute interval start
        // starting offset is Jan 1 2020 midnight.
        const intervalTimeMs = 6 * 60 * 1000;
        const startOffsetEpoch = new Date('2020-01-01T00:00:00.000Z').valueOf();
        const thisTimeEpoch = time.valueOf();
        const flooredTimeEpoch = thisTimeEpoch - thisTimeEpoch % intervalTimeMs;

        const offsetIndex = (flooredTimeEpoch - startOffsetEpoch) / intervalTimeMs;

        return offsetIndex;
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

        this.app.get('/tide-data/:year/:month/:day/:hour/:minute', (req, res) => {
            const year = req.params.year;
            const month = req.params.month;
            const day = req.params.day;
            const hour = req.params.hour;
            const minute = req.params.minute;
            res.send(JSON.stringify(this.tideData.getEntry(new Date(`${year}-${month}-${day}T${hour}:${minute}:00.000Z`))));
        })
    }

    run() {
        this.app.listen(this.listenPort, () => console.log(`hello world listening on ${this.listenPort}`));
    }
}

const listenPort = 3000;
const main = new Main(listenPort);
main.run();