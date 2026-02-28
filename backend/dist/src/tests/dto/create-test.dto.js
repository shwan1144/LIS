"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateTestDto = exports.TestPanelComponentDto = exports.TestResultTextOptionDto = exports.TestNumericAgeRangeDto = exports.TestParameterDefinitionDto = exports.TEST_RESULT_FLAGS = exports.TEST_RESULT_ENTRY_TYPES = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const test_entity_1 = require("../../entities/test.entity");
exports.TEST_RESULT_ENTRY_TYPES = ['NUMERIC', 'QUALITATIVE', 'TEXT'];
exports.TEST_RESULT_FLAGS = ['N', 'H', 'L', 'HH', 'LL', 'POS', 'NEG', 'ABN'];
class TestParameterDefinitionDto {
}
exports.TestParameterDefinitionDto = TestParameterDefinitionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], TestParameterDefinitionDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], TestParameterDefinitionDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['select', 'text']),
    __metadata("design:type", String)
], TestParameterDefinitionDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], TestParameterDefinitionDto.prototype, "options", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], TestParameterDefinitionDto.prototype, "normalOptions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], TestParameterDefinitionDto.prototype, "defaultValue", void 0);
class TestNumericAgeRangeDto {
}
exports.TestNumericAgeRangeDto = TestNumericAgeRangeDto;
__decorate([
    (0, class_validator_1.IsIn)(['ANY', 'M', 'F']),
    __metadata("design:type", String)
], TestNumericAgeRangeDto.prototype, "sex", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], TestNumericAgeRangeDto.prototype, "minAgeYears", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Object)
], TestNumericAgeRangeDto.prototype, "maxAgeYears", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], TestNumericAgeRangeDto.prototype, "normalMin", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Object)
], TestNumericAgeRangeDto.prototype, "normalMax", void 0);
class TestResultTextOptionDto {
}
exports.TestResultTextOptionDto = TestResultTextOptionDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], TestResultTextOptionDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.TEST_RESULT_FLAGS),
    __metadata("design:type", Object)
], TestResultTextOptionDto.prototype, "flag", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], TestResultTextOptionDto.prototype, "isDefault", void 0);
class TestPanelComponentDto {
}
exports.TestPanelComponentDto = TestPanelComponentDto;
__decorate([
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], TestPanelComponentDto.prototype, "childTestId", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], TestPanelComponentDto.prototype, "required", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], TestPanelComponentDto.prototype, "sortOrder", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", Object)
], TestPanelComponentDto.prototype, "reportSection", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", Object)
], TestPanelComponentDto.prototype, "reportGroup", void 0);
class CreateTestDto {
}
exports.CreateTestDto = CreateTestDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateTestDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(255),
    __metadata("design:type", String)
], CreateTestDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "abbreviation", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(test_entity_1.TestType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(test_entity_1.TubeType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "tubeType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "unit", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMin", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMax", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMinMale", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMaxMale", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMinFemale", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "normalMaxFemale", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(255),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "normalText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.TEST_RESULT_ENTRY_TYPES),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "resultEntryType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TestResultTextOptionDto),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "resultTextOptions", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TestPanelComponentDto),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "panelComponents", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsUUID)(undefined, { each: true }),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "panelComponentTestIds", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTestDto.prototype, "allowCustomResultText", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TestNumericAgeRangeDto),
    __metadata("design:type", Array)
], CreateTestDto.prototype, "numericAgeRanges", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTestDto.prototype, "childTestIds", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => TestParameterDefinitionDto),
    __metadata("design:type", Array)
], CreateTestDto.prototype, "parameterDefinitions", void 0);
__decorate([
    (0, class_validator_1.IsUUID)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "departmentId", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], CreateTestDto.prototype, "isActive", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateTestDto.prototype, "sortOrder", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], CreateTestDto.prototype, "expectedCompletionMinutes", void 0);
//# sourceMappingURL=create-test.dto.js.map