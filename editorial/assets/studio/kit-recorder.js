class KitRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) this.port.postMessage(channel);
    return true;
  }
}
registerProcessor('kit-recorder', KitRecorder);
