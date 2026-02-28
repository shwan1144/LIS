"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstrumentsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const instrument_entity_1 = require("../entities/instrument.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_test_result_history_entity_1 = require("../entities/order-test-result-history.entity");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const sample_entity_1 = require("../entities/sample.entity");
const order_entity_1 = require("../entities/order.entity");
const test_entity_1 = require("../entities/test.entity");
const instruments_service_1 = require("./instruments.service");
const instruments_controller_1 = require("./instruments.controller");
const hl7_parser_service_1 = require("./hl7-parser.service");
const astm_parser_service_1 = require("./astm-parser.service");
const tcp_listener_service_1 = require("./tcp-listener.service");
const result_processor_service_1 = require("./result-processor.service");
const hl7_ingestion_service_1 = require("./hl7-ingestion.service");
const astm_ingestion_service_1 = require("./astm-ingestion.service");
const panels_module_1 = require("../panels/panels.module");
let InstrumentsModule = class InstrumentsModule {
};
exports.InstrumentsModule = InstrumentsModule;
exports.InstrumentsModule = InstrumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                instrument_entity_1.Instrument,
                instrument_entity_1.InstrumentTestMapping,
                instrument_entity_1.InstrumentMessage,
                order_test_entity_1.OrderTest,
                order_test_result_history_entity_1.OrderTestResultHistory,
                unmatched_instrument_result_entity_1.UnmatchedInstrumentResult,
                sample_entity_1.Sample,
                order_entity_1.Order,
                test_entity_1.Test,
            ]),
            panels_module_1.PanelsModule,
        ],
        controllers: [instruments_controller_1.InstrumentsController],
        providers: [
            instruments_service_1.InstrumentsService,
            hl7_parser_service_1.HL7ParserService,
            astm_parser_service_1.AstmParserService,
            tcp_listener_service_1.TCPListenerService,
            result_processor_service_1.InstrumentResultProcessor,
            hl7_ingestion_service_1.HL7IngestionService,
            astm_ingestion_service_1.AstmIngestionService,
        ],
        exports: [
            instruments_service_1.InstrumentsService,
            hl7_parser_service_1.HL7ParserService,
            astm_parser_service_1.AstmParserService,
            tcp_listener_service_1.TCPListenerService,
            hl7_ingestion_service_1.HL7IngestionService,
            astm_ingestion_service_1.AstmIngestionService,
        ],
    })
], InstrumentsModule);
//# sourceMappingURL=instruments.module.js.map