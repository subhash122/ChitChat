import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.css'],
})
export class MessageComponent implements OnInit {
  @Input() public message;
  @Input() public currentUser;
  public isOwn;
  public live = false;
  constructor() { }

  ngOnInit(): void {
    this.isOwn = this.message.sender === this.currentUser._id;
  }
}
