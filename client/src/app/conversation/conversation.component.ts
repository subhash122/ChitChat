import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-conversation',
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.css'],
})
export class ConversationComponent implements OnInit {
  @Input() public conversation;
  @Input() public currentUser;
  public conversationInfo;
  public imgIcon = '../../images/person/1.jpeg';
  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    const friendId = this.conversation.members.find(
      (m) => m !== this.currentUser._id
    );

    this.http.get(`/api/users?userId=${friendId}`).subscribe((data) => {
      this.conversationInfo = data;
    });
  }
}
