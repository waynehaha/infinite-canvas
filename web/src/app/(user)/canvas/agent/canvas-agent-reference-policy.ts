export function shouldSendCanvasAgentVisualReferences(text: string) {
    return /分析|识别|描述|看懂|读图|图中|画面中|主体|构图|颜色|色彩|外观|服装|姿势|仿照|模仿|视觉参考|图片内容|画面内容/.test(text);
}
