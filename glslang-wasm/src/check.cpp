// Single-stage GLSL check: parse only, no linking or SPIR-V output

#include <glslang/Public/ResourceLimits.h>
#include <glslang/Public/ShaderLang.h>

#include <emscripten.h>

#include <cstdlib>
#include <cstring>
#include <string>

// Module.resolveInclude from index.js: malloc'd `name\0source`, or 0 if not found
EM_JS(char *, resolveInclude, (int system, const char *header, const char *includer, int depth), {
	return Module.resolveInclude(system, UTF8ToString(header), UTF8ToString(includer), depth);
});

class Includer : public glslang::TShader::Includer {
public:
	IncludeResult *includeSystem(const char *header, const char *includer, size_t depth) override {
		return resolve(1, header, includer, depth);
	}

	IncludeResult *includeLocal(const char *header, const char *includer, size_t depth) override {
		return resolve(0, header, includer, depth);
	}

	void releaseInclude(IncludeResult *result) override {
		if (result) {
			free(result->userData);
			delete result;
		}
	}

private:
	IncludeResult *resolve(int system, const char *header, const char *includer, size_t depth) {
		char *data = resolveInclude(system, header, includer, static_cast<int>(depth));
		if (!data) {
			return nullptr;
		}
		size_t nameLength = strlen(data);
		const char *source = data + nameLength + 1;
		return new IncludeResult(std::string(data, nameLength), source, strlen(source), data);
	}
};

static std::string infoLog;

extern "C" {

int initialize() { return glslang::InitializeProcess(); }

void finalize() { glslang::FinalizeProcess(); }

// name: source name in diagnostics, empty for string index
// stage: EShLanguage
// client: 0 none, 1 OpenGL, 2 Vulkan
// defaultProfile: EProfile, used without `#version`
// includes: enable `#include` via Module.resolveInclude
const char *check(const char *source, const char *name, int stage, int client, int defaultVersion, int defaultProfile,
	int includes) {
	auto language = static_cast<EShLanguage>(stage);
	glslang::TShader shader(language);

	if (*name) {
		shader.setStringsWithLengthsAndNames(&source, nullptr, &name, 1);
	} else {
		shader.setStrings(&source, 1);
	}

	if (includes) {
		shader.setPreamble("#extension GL_GOOGLE_include_directive : enable\n");
	}

	int messages = EShMsgDisplayErrorColumn | EShMsgCascadingErrors;

	switch (client) {
	case 1:
		shader.setEnvInput(glslang::EShSourceGlsl, language, glslang::EShClientOpenGL, 100);
		shader.setEnvClient(glslang::EShClientOpenGL, glslang::EShTargetOpenGL_450);
		shader.setEnvTarget(glslang::EShTargetSpv, glslang::EShTargetSpv_1_0);
		messages |= EShMsgSpvRules;
		break;
	case 2:
		shader.setEnvInput(glslang::EShSourceGlsl, language, glslang::EShClientVulkan, 100);
		shader.setEnvClient(glslang::EShClientVulkan, glslang::EShTargetVulkan_1_4);
		shader.setEnvTarget(glslang::EShTargetSpv, glslang::EShTargetSpv_1_6);
		messages |= EShMsgSpvRules | EShMsgVulkanRules;
		break;
	}

	Includer includer;
	shader.parse(GetDefaultResources(), defaultVersion, static_cast<EProfile>(defaultProfile), false, false,
		static_cast<EShMessages>(messages), includer);

	infoLog = shader.getInfoLog();
	return infoLog.c_str();
}

}
