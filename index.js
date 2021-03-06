const express = require('express');
const bodyParser = require('body-parser');
const got = require('got');

class TideData {
    // NOAA water level product has 6 minute intervals, so structure local data storage to match that
    // use an array where each index is a new 6 minute interval
    // starting offset of 0 would be Jan 1 2020 00:00:00Z

    // format for water_levels
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

    // format for predictions
    // {
    //    "predictions" : [
    //         {"t":"2020-01-01 00:00", "v":"5.889"},
    //         {"t":"2020-01-01 00:06", "v":"5.804"},
    //         ...
    //    ]
    // }

    constructor() {
        this.rawData = [];

        this.downloadData();
    }

    async downloadData() {
        // https://tidesandcurrents.noaa.gov/api-helper/url-generator.html
        // https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=20200101&end_date=20200131&station=9410170&product=water_level&datum=MTL&time_zone=gmt&units=english&format=json
        // limited to 31 days max per request

        let startDate = new Date('2020-01-01T00:00:00.000Z');
        const endDate = new Date('2020-12-31T23:59:59.999Z');
        let daysIncrement = 31;

        let reqStartDate = startDate;
        while(reqStartDate < endDate) {
            // compute end date for request
            let reqEndDate = new Date(reqStartDate);
            reqEndDate.setDate(reqStartDate.getDate() + daysIncrement);
            if (reqEndDate > endDate) reqEndDate = endDate;

            console.log(`requesting data for ${reqStartDate.toISOString()} - ${reqEndDate.toISOString()}`);

            // super hacky because JS Date isn't great, grab first 10 chars of ISO format
            let apiBeginDateString = reqStartDate.toISOString().slice(0,10).replace(/-/g, '');
            let apiEndDateString = reqEndDate.toISOString().slice(0,10).replace(/-/g, '');

            let url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
            let queryParams = {
                begin_date: apiBeginDateString,
                end_date: apiEndDateString,
                station: 9410170, // San Diego
                product: 'predictions', // water_level has historical, but nothing in the future
                datum: 'STND', // Station Datum
                time_zone: 'gmt',
                units: 'english',
                format: 'json'
            };

            let request = got(url, {
                responseType: 'json',
                searchParams: queryParams
            }).then((res) => {
                if (res.body.error) {
                // TODO: need to handle error case, will mess up rawData with current append methodology
                    console.log('ERROR: ', res.body.err);
                } else {
                    //this.parseData(res.body.data); // data is the member for water_level
                    this.parseData(res.body.predictions) // predictions is the member for predictions
                }
            }).catch((err) => {
                // TODO: need to handle error case, will mess up rawData with current append methodology
                console.log('ERROR: ', err);
            });
            await request; // force synchronous to ensure async requests come back in order, since parseData is assuming in order

            reqStartDate = reqEndDate;
            reqStartDate.setDate(reqStartDate.getDate() + 1); // increment one day since NOAA API is inclusive on end date
        }
    }

    parseData(payloadArray) {
        // TODO: assuming all data in order already, just append to existing storage
        // TODO: should check data and store at correct index using getIndexFromTime() indexing
        this.rawData = this.rawData.concat(payloadArray);
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

    getDateString(year, month, day, hour, minute) {
        // pad total possible 0's then slice total possible 0's len from end of string
        const yearPad = `0000${year}`.slice(-4);
        const monthPad = `00${month}`.slice(-2);
        const dayPad = `00${day}`.slice(-2);
        const hourPad = `00${hour}`.slice(-2);
        const minutePad = `00${minute}`.slice(-2);

        return `${yearPad}-${monthPad}-${dayPad}T${hourPad}:${minutePad}:00.000Z`;
    }

    getTideData(year, month, day, hour, minute) {
        const dateString = this.getDateString(year, month, day, hour, minute);
        const date = new Date(dateString);
        if (isNaN(date.valueOf())) {
            throw `Invalid date string ${dateString}`;
        }
        return this.tideData.getEntry(date);
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.status(200);
            res.send('hello world');
        });

        // curl -v localhost:3000/tide-data/2020/08/01/00/00
        this.app.get('/tide-data/:year?/:month?/:day?/:hour?/:minute?', (req, res) => {
            const year = req.params.year ?? '2020';
            const month = req.params.month ?? '1';
            const day = req.params.day ?? '1';
            const hour = req.params.hour ?? '00';
            const minute = req.params.minute ?? '00';

            let dataEntry;
            try {
                dataEntry = this.getTideData(year, month, day, hour, minute);

                if (!dataEntry) {
                    throw 'no data stored for this time'; // just throw same as getTideData for date error since same response
                }
            } catch(err) {
                // catch bad Date() format, or no data found
                res.status(500);
                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify({
                    error: err
                }));
                return;
            }

            res.status(200);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(dataEntry));
        });

        this.app.get('/*', (req, res) => {
            res.status(400);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({
                error: 'No API endpoint'
            }));
        });
    }

    run() {
        this.app.listen(this.listenPort, () => console.log(`server listening on ${this.listenPort}`));
    }
}

const listenPort = 3000;
const main = new Main(listenPort);
main.run();
