// Single-stage GLSL check: parse only, no linking or SPIR-V output

#include <glslang/Public/ResourceLimits.h>
#include <glslang/Public/ShaderLang.h>

#include <string>

static std::string infoLog;

extern "C" {

int initialize() { return glslang::InitializeProcess(); }

void finalize() { glslang::FinalizeProcess(); }

// stage: EShLanguage
// client: 0 none, 1 OpenGL, 2 Vulkan
// defaultProfile: EProfile, used without `#version`
const char *check(const char *source, int stage, int client, int defaultVersion, int defaultProfile) {
	auto language = static_cast<EShLanguage>(stage);
	glslang::TShader shader(language);
	shader.setStrings(&source, 1);

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

	shader.parse(GetDefaultResources(), defaultVersion, static_cast<EProfile>(defaultProfile), false, false,
		static_cast<EShMessages>(messages));

	infoLog = shader.getInfoLog();
	return infoLog.c_str();
}

}
