// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');
const axios = require('axios');
const { QnAMaker } = require('botbuilder-ai');
const DentistScheduler = require('./dentistscheduler');
const IntentRecognizer = require("./intentrecognizer")

class DentaBot extends ActivityHandler {
    constructor(configuration, qnaOptions) {
        // call the parent constructor
        super();
        if (!configuration) throw new Error('[QnaMakerBot]: Missing parameter. configuration is required');

        // create a QnAMaker connector
        this.QnAMaker = new QnAMaker(configuration.QnAConfiguration, qnaOptions)

        // create a DentistScheduler connector
        this.dentistScheduler = new DentistScheduler(configuration.SchedulerConfiguration)

        // create a IntentRecognizer connector
        this.intentRecognizer = new IntentRecognizer(configuration.LuisConfiguration);

		this.onMessage(async (context, next) => {
			const userInput = context.activity.text;
			const qnaResults = await this.queryCognitiveLanguageService(userInput);
			const LuisResult = await this.intentRecognizer.executeLuisQuery(context);

			// Check if a valid answer was received from QnA Maker first
			if (qnaResults && qnaResults.answers && qnaResults.answers.length > 0 && qnaResults.answers[0].answer !== 'No answer found') {
			// Respond with the answer from QnA Maker
				await context.sendActivity(qnaResults.answers[0].answer);
			} else if (LuisResult.luisResult.prediction.topIntent === "GetAvailability" &&
               LuisResult.intents.GetAvailability.score > .85) {
				// Handle 'GetAvailability' intent from LUIS
				const dentistAvailabilityResponse = await this.dentistScheduler.getAvailability();
				await context.sendActivity(dentistAvailabilityResponse);
			} else if (LuisResult.luisResult.prediction.topIntent === "ScheduleAppointment" &&
               LuisResult.intents.ScheduleAppointment.score > .6 &&
               LuisResult.entities.$instance &&
               LuisResult.entities.$instance.time) {
				// Handle 'ScheduleAppointment' intent from LUIS
				const time = LuisResult.entities.$instance.time[0].text;
				const scheduleAppointmentResponse = await this.dentistScheduler.scheduleAppointment(time);
				await context.sendActivity(scheduleAppointmentResponse);
			} else {
				// Respond with a default message if no intents are recognized or no answer is found
				await context.sendActivity("Could you say that differently? I had trouble understanding it.");
			}
			await next();
		});


        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            //write a custom greeting
            const welcomeText = `Hello! I am the Contoso Dentistry Virtual Assistant! 
                            Try asking me for available appointment slots, or book an appointment! 
                            I can also answer some of your questions `;

            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // by calling next() you ensure that the next BotHandler is run.
            await next();
        });
    }
	   async queryCognitiveLanguageService(question) {
        const endpoint = process.env.QnAEndpointHostName + "/language/:query-knowledgebases";
        const projectName = process.env.QnAKnowledgebaseId; // Your project name
        const apiVersion = "2021-10-01"; // API version
        const deploymentName = "production"; // Deployment name

        const url = `${endpoint}?projectName=${projectName}&api-version=${apiVersion}&deploymentName=${deploymentName}`;
        const headers = {
            'Ocp-Apim-Subscription-Key': process.env.QnAAuthKey, // Use your subscription key
            'Content-Type': 'application/json'
        };
        const body = {
            top: 3,
            question: question,
            includeUnstructuredSources: true,
            confidenceScoreThreshold: 0.5, // Set your desired threshold
            // Add other fields as per your curl command
        };

        console.log("Sending request to Cognitive Language Service:");
        console.log("URL: ", url);
        console.log("Body: ", body);

        try {
            const response = await axios.post(url, body, { headers: headers });
            console.log("Response from Cognitive Language Service:", response.data);
            return response.data;
        } catch (error) {
            console.error("Error querying Cognitive Language Service:", error.message);
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error("Error Data:", error.response.data);
                console.error("Error Status:", error.response.status);
                console.error("Error Headers:", error.response.headers);
            } else if (error.request) {
                // The request was made but no response was received
                console.error("No response received for the request:", error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error("Error in setting up the request:", error.message);
            }
            throw error;
        }
    }


}

module.exports.DentaBot = DentaBot;
