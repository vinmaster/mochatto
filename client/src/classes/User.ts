import { UserInfo, defaultUserInfo } from "../contexts/UserInfoContext";
import { AudioVisualizer, gainToMultiplier } from "./AudioVisualizer";

class User {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  sender: RTCRtpSender;
  id: string;
  stream: MediaStream;
  player: HTMLAudioElement;
  selfPosition: [number, number];
  peerPosition: [number, number];
  visualizer: AudioVisualizer;
  multiplier: number;
  // a function to update the positions array context
  setPosition: (positionString) => void;
  setUserInfo: (info) => void;
  userInfo: UserInfo;
  constructor(id: string) {
    this.id = id;
    this.sender = null as unknown as RTCRtpSender;
    this.dataChannel = null as unknown as RTCDataChannel;
    // initialize with a free public STUN server to find out public ip, NAT type, and internet side port
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.multiplier = 0;
    this.stream = new MediaStream();
    this.visualizer = null as unknown as AudioVisualizer;
    this.player = new Audio();
    this.selfPosition = [0, 0];
    this.peerPosition = [0, 0];
    // the function is re-assigned during the user's initialization
    this.setPosition = (positionString) => console.warn(positionString);
    this.setUserInfo = (info) => console.warn(info);
    this.userInfo = defaultUserInfo;

    // listener for when a peer adds a track
    this.peerConnection.ontrack = (event) => {
      this.updateLocalTrack(event.track);
    };
  }

  onAudioActivity(gain: number): void {
    this.multiplier = gainToMultiplier(gain);
    const newInfo = { multiplier: this.multiplier };
    this.setUserInfo(newInfo);
  }

  onDataChannelMessage(event: MessageEvent): void {
    const info = JSON.parse(event.data).info as UserInfo;
    this.setUserInfo(info);

    const position = JSON.parse(event.data).position;
    this.peerPosition = position;
    this.updateVolume();
    this.setPosition(position);
  }

  // runs when the data channel opens
  onDataChannelOpen(): void {
    const data = { position: this.selfPosition, info: this.userInfo };
    this.dataChannel.send(JSON.stringify(data));
  }

  // runs when the data channel closes
  onDataChannelClose(): void {
    this.visualizer.stop();
  }

  setSelfPosition(position: [number, number]): void {
    this.selfPosition = position;
    this.updateVolume();
  }

  updateVolume(): void {
    this.setVolume(this.getVolume(this.selfPosition, this.peerPosition));
  }

  getVolume(selfPosition: [number, number], peerPosition: [number, number]): number {
    const distance = Math.sqrt(
      Math.pow(selfPosition[0] - peerPosition[0], 2) +
        Math.pow(selfPosition[1] - peerPosition[1], 2)
    );
    const max = 600;
    let volume = 0;
    if (distance < max) {
      volume = (max - distance) / max;
    }
    return volume;
  }

  // sets volume for this peer user
  setVolume(volume: number): void {
    if (volume >= 0 && volume <= 1) {
      this.player.volume = volume;
    } else {
      console.warn("Volume needs to be within 0 and 1");
    }
  }

  // keeping note of the track to remove later
  setSender(s: RTCRtpSender): void {
    this.sender = s;
  }

  // updates the local track when the peer user (this) adds a new track
  updateLocalTrack(track: MediaStreamTrack): boolean {
    if (!track.readyState) {
      return false;
    }
    // if there's already a track assigned to the stream, remove it
    if (this.stream.getAudioTracks()[0]) {
      this.stream.removeTrack(this.stream.getAudioTracks()[0]);
    }
    // add the track
    this.stream.addTrack(track);

    if (this.visualizer) {
      this.visualizer.setStream(this.stream);
    }

    // set the new stream as the audio source and play
    this.player.srcObject = this.stream;
    this.player.play();
    this.player.autoplay = true;
    return true;
  }

  // Update the shared mediastream to the new audio input
  updateRemoteTrack(track: MediaStreamTrack): void {
    if (this.sender) {
      this.peerConnection.removeTrack(this.sender);
    }
    this.setSender(this.peerConnection.addTrack(track));
  }
}

export default User;
