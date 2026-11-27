class KitRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(384);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      let pos = 0;
      while (pos < channel.length) {
        const size = Math.min(this.frame.length-this.offset,channel.length-pos);
        this.frame.set(channel.subarray(pos,pos+size),this.offset);
        pos += size;
        this.offset += size;
        if (this.offset === this.frame.length) {
          this.port.postMessage(this.frame,[this.frame.buffer]);
          this.frame = new Float32Array(384);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('kit-recorder',KitRecorder);
