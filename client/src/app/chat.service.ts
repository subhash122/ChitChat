import { BehaviorSubject, Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  public incommingMessage$: BehaviorSubject<{ senderId; text; createdAt }> =
    new BehaviorSubject(null);
  constructor() { }

  socket = io('ws://localhost:8900');

  public addNewUser(user): void {
    this.socket.emit('addUser', user._id);
  }

  public sendMessage(message): void {
    this.socket.emit('sendMessage', message);
  }

  public getNewMessage(): Observable<{ senderId; text; createdAt }> {
    this.socket.on('getMessage', (data) => {
      this.incommingMessage$.next({
        senderId: data.senderId,
        text: data.text,
        createdAt: Date.now(),
      });
    });

    return this.incommingMessage$.asObservable();
  }
}
