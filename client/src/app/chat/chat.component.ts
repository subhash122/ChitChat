import { ChatService } from './../chat.service';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  Input,
  OnChanges,
  OnInit,
  AfterViewChecked,
} from '@angular/core';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnChanges {
  @Input() public selectedConversation;
  public currentUser;
  public messages;
  public newMessage;
  constructor(private http: HttpClient, private chatService: ChatService) { }

  @Input() set user(userInfo) {
    this.currentUser = userInfo;
    if (this.currentUser) {
      this.chatService.addNewUser(this.currentUser);
    }
  }
  ngOnChanges(): void {
    if (this.selectedConversation) {
      this.http
        .get(`/api/messages/${this.selectedConversation?._id}`)
        .subscribe((data) => {
          this.messages = data;
          setTimeout(() => {
            this.scrollToBottom();
          }, 1);
        });
      this.chatService.getNewMessage().subscribe((incommingMessage) => {
        if (
          incommingMessage &&
          this.selectedConversation.members.includes(incommingMessage.senderId)
        ) {
          this.messages = [...this.messages, incommingMessage];
          setTimeout(() => {
            this.scrollToBottom();
          }, 1);
        }
      });
    }
  }

  public scrollToBottom(): void {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  public handleSubmit(): void {
    const message = {
      sender: this.currentUser._id,
      text: this.newMessage,
      conversationId: this.selectedConversation._id,
    };
    this.http.post('/api/messages', message).subscribe((data) => {
      this.messages = [...this.messages, data];
    });

    const receiverId = this.selectedConversation.members.find(
      (member) => member !== this.currentUser._id
    );
    this.chatService.sendMessage({
      senderId: this.currentUser._id,
      receiverId,
      text: this.newMessage,
    });
    this.newMessage = '';
  }
}
