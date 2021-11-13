import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../user.service';

@Component({
  selector: 'app-messenger',
  templateUrl: './messenger.component.html',
  styleUrls: ['./messenger.component.css'],
})
export class MessengerComponent implements OnInit {
  public user;
  public conversations;
  public selectedConversation;
  constructor(
    private http: HttpClient,
    private userService: UserService,
    private router: Router,
  ) { }

  ngOnInit(): void {
    this.userService.currentUser$.subscribe((user) => {
      if (user) {
        this.user = user;
        this.getConversations();
      } else {
        this.router.navigateByUrl('/login');
      }
    });
  }

  public getConversations(): void {
    this.http
      .get(`/api/conversations/${this.user._id}`)
      .subscribe((data: []) => {
        this.conversations = [...data];
      });
  }

  public handleClick(conversation): void {
    this.selectedConversation = conversation;
  }
}
